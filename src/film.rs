use image::{ImageResult, Rgb, RgbImage};

pub struct Film {
    pixels: RgbImage,
}

impl Film {
    pub fn new(width: u32, height: u32) -> Self {
        Self { pixels: RgbImage::new(width, height) }
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
