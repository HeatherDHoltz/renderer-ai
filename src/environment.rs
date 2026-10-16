//! Piecewise-constant lat-long radiance with exact texel solid-angle sampling.
use glam::Vec3;
use std::{
    f64::consts::{PI, TAU},
    io::BufReader,
    path::Path,
};

pub struct Environment {
    width: usize,
    height: usize,
    pixels: Vec<Vec3>,
    probabilities: Vec<f64>,
    cdf: Vec<f64>,
    rotation: f64,
    intensity: f32,
}
pub struct EnvironmentSample {
    pub direction: Vec3,
    pub radiance: Vec3,
    pub pdf: f32,
}
impl Environment {
    pub fn load(path: &Path, intensity: f32, rotation_degrees: f32) -> Result<Self, String> {
        if std::fs::metadata(path)
            .map_err(|e| format!("{}: {e}", path.display()))?
            .len()
            > 64 * 1024 * 1024
        {
            return Err("HDR environment exceeds 64 MiB limit".into());
        }
        let decoder = image::codecs::hdr::HdrDecoder::new(BufReader::new(
            std::fs::File::open(path).map_err(|e| e.to_string())?,
        ))
        .map_err(|e| format!("{}: {e}", path.display()))?;
        let metadata = decoder.metadata();
        let (width, height) = (metadata.width as usize, metadata.height as usize);
        if width == 0 || height == 0 || width > 8192 || height > 8192 || width * height > 4_194_304
        {
            return Err("HDR map must be 1..4 megapixels with dimensions <=8192".into());
        }
        let pixels = decoder
            .read_image_hdr()
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|p| Vec3::from_array(p.0))
            .collect();
        Self::new(width, height, pixels, intensity, rotation_degrees)
    }
    pub fn new(
        width: usize,
        height: usize,
        pixels: Vec<Vec3>,
        intensity: f32,
        rotation_degrees: f32,
    ) -> Result<Self, String> {
        if width == 0
            || height == 0
            || width > 8192
            || height > 8192
            || width * height > 4_194_304
            || pixels.len() != width * height
        {
            return Err("invalid HDR map dimensions/pixel count".into());
        }
        if !intensity.is_finite()
            || intensity < 0.0
            || !rotation_degrees.is_finite()
            || pixels
                .iter()
                .any(|p| !p.is_finite() || p.min_element() < 0.0 || !(*p * intensity).is_finite())
        {
            return Err(
                "environment must contain finite nonnegative radiance/intensity/rotation".into(),
            );
        }
        let mut weights = Vec::with_capacity(pixels.len());
        for (i, pixel) in pixels.iter().enumerate() {
            let area = Self::row_area(width, height, i / width);
            let luminance = pixel
                .as_dvec3()
                .dot(glam::DVec3::new(0.2126, 0.7152, 0.0722));
            weights.push(luminance * area);
        }
        let mut total: f64 = weights.iter().sum();
        if total == 0.0 {
            for (i, w) in weights.iter_mut().enumerate() {
                *w = Self::row_area(width, height, i / width);
            }
            total = weights.iter().sum();
        }
        let probabilities: Vec<_> = weights.into_iter().map(|w| w / total).collect();
        let mut cdf = Vec::with_capacity(probabilities.len());
        let mut sum = 0.0;
        for p in &probabilities {
            sum += p;
            cdf.push(sum);
        }
        *cdf.last_mut().expect("nonempty map") = 1.0;
        Ok(Self {
            width,
            height,
            pixels,
            probabilities,
            cdf,
            rotation: (rotation_degrees as f64).to_radians().rem_euclid(TAU),
            intensity,
        })
    }
    pub fn texel_solid_angle(&self, row: usize) -> f64 {
        Self::row_area(self.width, self.height, row)
    }
    fn row_area(width: usize, height: usize, row: usize) -> f64 {
        TAU / width as f64
            * ((PI * row as f64 / height as f64).cos()
                - (PI * (row + 1) as f64 / height as f64).cos())
    }
    fn index(&self, direction: Vec3) -> usize {
        let d = direction.normalize_or_zero();
        let phi = ((d.z as f64).atan2(d.x as f64) - self.rotation).rem_euclid(TAU);
        let theta = (d.y as f64).clamp(-1.0, 1.0).acos();
        let x = (phi / TAU * self.width as f64) as usize;
        let y = ((theta / PI * self.height as f64) as usize).min(self.height - 1);
        y * self.width + x.min(self.width - 1)
    }
    pub fn eval(&self, direction: Vec3) -> Vec3 {
        self.pixels[self.index(direction)] * self.intensity
    }
    pub fn pdf(&self, direction: Vec3) -> f32 {
        let i = self.index(direction);
        (self.probabilities[i] / Self::row_area(self.width, self.height, i / self.width)) as f32
    }
    pub fn sample(&self, u: [f32; 3]) -> EnvironmentSample {
        let index = self
            .cdf
            .partition_point(|p| *p <= u[0] as f64)
            .min(self.cdf.len() - 1);
        let x = index % self.width;
        let y = index / self.width;
        // Midpoints of the 24-bit random bins avoid exact pole directions.
        let open = |v: f32| {
            (v as f64 + 0.5 / 16_777_216.0).clamp(0.5 / 16_777_216.0, 1.0 - 0.5 / 16_777_216.0)
        };
        let phi = TAU * (x as f64 + open(u[1])) / self.width as f64 + self.rotation;
        let c0 = (PI * y as f64 / self.height as f64).cos();
        let c1 = (PI * (y + 1) as f64 / self.height as f64).cos();
        let cosine = c0 + (c1 - c0) * open(u[2]);
        let sine = (1.0 - cosine * cosine).max(0.0).sqrt();
        let direction = Vec3::new(
            (sine * phi.cos()) as f32,
            cosine as f32,
            (sine * phi.sin()) as f32,
        );
        EnvironmentSample {
            direction,
            radiance: self.pixels[index] * self.intensity,
            pdf: (self.probabilities[index] / Self::row_area(self.width, self.height, y)) as f32,
        }
    }
}
