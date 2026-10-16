use glam::Vec3;
use image::{ImageResult, Rgb, RgbImage};

pub fn linear_to_srgb(x: f32) -> f32 {
    if x <= 0.0031308 {
        12.92 * x
    } else {
        1.055 * x.powf(1.0 / 2.4) - 0.055
    }
}

#[derive(Clone, Copy, Debug)]
pub enum ToneMap {
    Linear,
    Reinhard,
}

/// Linear radiance sums and per-pixel sample counts; no per-sample clamping.
pub struct LinearFilm {
    pub width: u32,
    pub height: u32,
    sums: Vec<Vec3>,
    counts: Vec<u32>,
}

impl LinearFilm {
    pub fn save_hdr(&self, path: &std::path::Path) -> Result<(), String> {
        if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut pixels = Vec::with_capacity((self.width * self.height) as usize);
        for y in 0..self.height {
            for x in 0..self.width {
                let p = self.pixel(x, y);
                if !p.is_finite() || p.min_element() < 0.0 || p.max_element() >= 2.0_f32.powi(127) {
                    return Err("radiance exceeds Radiance RGBE output range".into());
                }
                pixels.push(image::Rgb(p.to_array()));
            }
        }
        use std::io::Write;
        let mut output =
            std::io::BufWriter::new(std::fs::File::create(path).map_err(|e| e.to_string())?);
        image::codecs::hdr::HdrEncoder::new(&mut output)
            .encode(&pixels, self.width as usize, self.height as usize)
            .map_err(|e| e.to_string())?;
        output.flush().map_err(|e| e.to_string())
    }
    pub(crate) fn accumulation(&self, x: u32, y: u32) -> (Vec3, u32) {
        let i = (y * self.width + x) as usize;
        (self.sums[i], self.counts[i])
    }
    pub(crate) fn set_accumulation(
        &mut self,
        x: u32,
        y: u32,
        sum: Vec3,
        count: u32,
    ) -> Result<(), String> {
        if !sum.is_finite() || sum.min_element() < 0.0 || count == 0 {
            return Err("invalid tile radiance accumulation".into());
        }
        let i = (y * self.width + x) as usize;
        self.sums[i] = sum;
        self.counts[i] = count;
        Ok(())
    }
    pub fn new(width: u32, height: u32) -> Result<Self, String> {
        if width == 0
            || height == 0
            || width > 8192
            || height > 8192
            || u64::from(width) * u64::from(height) > 16_777_216
        {
            return Err("film dimensions must be 1..8192 and at most 16 megapixels".into());
        }
        let len = (width as usize) * (height as usize);
        Ok(Self {
            width,
            height,
            sums: vec![Vec3::ZERO; len],
            counts: vec![0; len],
        })
    }
    pub fn add_sample(&mut self, x: u32, y: u32, color: Vec3) -> Result<(), String> {
        if x >= self.width || y >= self.height {
            return Err("film pixel outside bounds".into());
        }
        if !color.is_finite() || color.min_element() < 0.0 {
            return Err("radiance must be finite and nonnegative".into());
        }
        let i = (y * self.width + x) as usize;
        let sum = self.sums[i] + color;
        if !sum.is_finite() {
            return Err("radiance accumulation overflow".into());
        }
        let count = self.counts[i]
            .checked_add(1)
            .ok_or("sample count overflow")?;
        self.sums[i] = sum;
        self.counts[i] = count;
        Ok(())
    }
    pub fn pixel(&self, x: u32, y: u32) -> Vec3 {
        assert!(x < self.width && y < self.height);
        let i = (y * self.width + x) as usize;
        self.sums[i] / self.counts[i].max(1) as f32
    }
    pub fn sample_count(&self, x: u32, y: u32) -> u32 {
        assert!(x < self.width && y < self.height);
        self.counts[(y * self.width + x) as usize]
    }
    pub fn display(&self, exposure: f32, tone: ToneMap) -> Result<RgbImage, String> {
        let multiplier = exposure.exp2();
        if !multiplier.is_finite() || multiplier == 0.0 {
            return Err("exposure outside finite f32 range".into());
        }
        let mut image = RgbImage::new(self.width, self.height);
        for (x, y, pixel) in image.enumerate_pixels_mut() {
            let mut color = self.pixel(x, y) * multiplier;
            if !color.is_finite() {
                return Err("exposure overflowed radiance".into());
            }
            if matches!(tone, ToneMap::Reinhard) {
                color = color / (Vec3::ONE + color);
            }
            *pixel = Rgb(color
                .to_array()
                .map(|v| (linear_to_srgb(v).clamp(0.0, 1.0) * 255.0).round() as u8));
        }
        Ok(image)
    }
}

pub struct Film {
    pixels: RgbImage,
}

impl Film {
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            pixels: RgbImage::new(width, height),
        }
    }

    pub fn set_pixel(&mut self, x: u32, y: u32, color: [u8; 3]) {
        self.pixels.put_pixel(x, y, Rgb(color));
    }

    pub fn get_pixel(&self, x: u32, y: u32) -> [u8; 3] {
        self.pixels.get_pixel(x, y).0
    }

    pub fn save(&self, filename: &str) -> ImageResult<()> {
        self.pixels.save(filename)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_and_get_pixel() {
        let mut film = Film::new(3, 2);
        film.set_pixel(2, 1, [0, 0, 255]);
        assert_eq!(film.get_pixel(2, 1), [0, 0, 255]);
        assert_eq!(film.get_pixel(1, 1), [0, 0, 0]);
        film.set_pixel(2, 1, [255, 0, 0]);
        assert_eq!(film.get_pixel(2, 1), [255, 0, 0]);
    }

    #[test]
    fn pixels_and_png() {
        let mut film = Film::new(2, 2);
        film.set_pixel(0, 0, [255, 0, 0]);
        film.set_pixel(1, 1, [0, 255, 0]);
        assert_eq!(film.get_pixel(0, 0), [255, 0, 0]);
        let path = std::env::temp_dir().join(format!("renderer-film-{}.png", std::process::id()));
        film.save(path.to_str().unwrap()).unwrap();
        let image = image::open(&path).unwrap().to_rgb8();
        assert_eq!(image.dimensions(), (2, 2));
        assert_eq!(image.get_pixel(0, 0).0, [255, 0, 0]);
        assert_eq!(image.get_pixel(1, 1).0, [0, 255, 0]);
        std::fs::remove_file(path).unwrap();
    }
}
