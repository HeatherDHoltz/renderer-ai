use glam::{Vec2, Vec3};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Filter {
    Nearest,
    #[default]
    Bilinear,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Wrap {
    #[default]
    Repeat,
    Clamp,
}

pub enum Texture {
    Checker {
        a: Vec3,
        b: Vec3,
        scale: Vec2,
    },
    Image {
        width: usize,
        height: usize,
        pixels: Vec<Vec3>,
        filter: Filter,
        wrap: Wrap,
    },
}

pub fn srgb_to_linear(x: f32) -> f32 {
    if x <= 0.04045 {
        x / 12.92
    } else {
        ((x + 0.055) / 1.055).powf(2.4)
    }
}

impl Texture {
    pub fn pixel_count(&self) -> usize {
        match self {
            Self::Checker { .. } => 0,
            Self::Image { pixels, .. } => pixels.len(),
        }
    }
    pub fn load(path: &Path, filter: Filter, wrap: Wrap) -> Result<Self, String> {
        let bytes = std::fs::metadata(path)
            .map_err(|e| format!("{}: {e}", path.display()))?
            .len();
        if bytes > 64 * 1024 * 1024 {
            return Err("texture exceeds 64 MiB input limit".into());
        }
        let (width, height) =
            image::image_dimensions(path).map_err(|e| format!("{}: {e}", path.display()))?;
        if width == 0 || height == 0 || u64::from(width) * u64::from(height) > 4_194_304 {
            return Err("texture must contain 1..4 megapixels".into());
        }
        let image = image::open(path)
            .map_err(|e| format!("{}: {e}", path.display()))?
            .to_rgb8();
        let pixels = image
            .pixels()
            .map(|p| Vec3::from_array(p.0.map(|v| srgb_to_linear(v as f32 / 255.0))))
            .collect();
        Ok(Self::Image {
            width: width as usize,
            height: height as usize,
            pixels,
            filter,
            wrap,
        })
    }
    pub fn sample(&self, uv: Vec2) -> Vec3 {
        match self {
            Self::Checker { a, b, scale } => {
                let p = uv * *scale;
                if ((p.x.floor() + p.y.floor()) % 2.0).abs() < 0.5 {
                    *a
                } else {
                    *b
                }
            }
            Self::Image {
                width,
                height,
                pixels,
                filter,
                wrap,
            } => {
                let uv = match wrap {
                    Wrap::Repeat => Vec2::new(uv.x.rem_euclid(1.0), uv.y.rem_euclid(1.0)),
                    Wrap::Clamp => uv.clamp(Vec2::ZERO, Vec2::ONE),
                };
                let texel = |x: i64, y: i64| {
                    let index = |i: i64, size: usize| match wrap {
                        Wrap::Repeat => i.rem_euclid(size as i64) as usize,
                        Wrap::Clamp => i.clamp(0, size as i64 - 1) as usize,
                    };
                    pixels[index(y, *height) * width + index(x, *width)]
                };
                match filter {
                    Filter::Nearest => texel(
                        (uv.x * *width as f32).floor() as i64,
                        ((1.0 - uv.y) * *height as f32).floor() as i64,
                    ),
                    Filter::Bilinear => {
                        let x = uv.x * *width as f32 - 0.5;
                        let y = (1.0 - uv.y) * *height as f32 - 0.5;
                        let ix = x.floor() as i64;
                        let iy = y.floor() as i64;
                        let fx = x - x.floor();
                        let fy = y - y.floor();
                        texel(ix, iy)
                            .lerp(texel(ix + 1, iy), fx)
                            .lerp(texel(ix, iy + 1).lerp(texel(ix + 1, iy + 1), fx), fy)
                    }
                }
            }
        }
    }
}
