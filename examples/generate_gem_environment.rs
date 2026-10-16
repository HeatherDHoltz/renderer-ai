//! Synthetic jewelry light tent: bright cards and narrow dark strips for facet contrast.
use glam::Vec3;
use image::{Rgb, codecs::hdr::HdrEncoder};
use std::{
    f32::consts::{PI, TAU},
    io::{BufWriter, Write},
};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let (width, height) = (512, 256);
    let mut pixels = Vec::with_capacity(width * height);
    for y in 0..height {
        let theta = PI * (y as f32 + 0.5) / height as f32;
        for x in 0..width {
            let phi = TAU * (x as f32 + 0.5) / width as f32;
            let mut c = Vec3::new(0.34, 0.39, 0.48) * (0.8 + 0.2 * theta.cos());
            let angular = |center: f32| ((phi - center + PI).rem_euclid(TAU) - PI).abs();
            if angular(0.9) < 0.45 && (theta - 0.7).abs() < 0.45 {
                c = Vec3::new(5.0, 4.6, 4.0);
            }
            if angular(3.7) < 0.7 && (theta - 1.0).abs() < 0.65 {
                c = Vec3::new(2.0, 2.5, 3.2);
            }
            if angular(5.2) < 0.12 && (theta - 1.1).abs() < 0.8 {
                c = Vec3::splat(8.0);
            }
            if angular(2.2) < 0.09 || angular(4.8) < 0.06 {
                c = Vec3::splat(0.015);
            }
            pixels.push(Rgb(c.to_array()));
        }
    }
    std::fs::create_dir_all("assets/gems")?;
    let mut file = BufWriter::new(std::fs::File::create("assets/gems/light-tent.hdr")?);
    HdrEncoder::new(&mut file).encode(&pixels, width, height)?;
    file.flush()?;
    println!("Generated 512x256 synthetic gem light tent");
    Ok(())
}
