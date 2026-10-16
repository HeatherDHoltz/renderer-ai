//! Offline synthetic environment, authored from simple angular softboxes.
use glam::Vec3;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let width = 256;
    let height = 128;
    let mut pixels = vec![];
    for y in 0..height {
        for x in 0..width {
            let phi = 2.0 * std::f32::consts::PI * (x as f32 + 0.5) / width as f32;
            let theta = std::f32::consts::PI * (y as f32 + 0.5) / height as f32;
            let mut color = if theta < std::f32::consts::FRAC_PI_2 {
                Vec3::new(0.12, 0.16, 0.23)
            } else {
                Vec3::new(0.045, 0.05, 0.065)
            };
            if (phi - 1.0).abs() < 0.45 && (theta - 0.65).abs() < 0.22 {
                color += Vec3::new(14.0, 11.5, 8.0);
            }
            if (phi - 3.7).abs() < 0.25 && (theta - 0.95).abs() < 0.36 {
                color += Vec3::new(5.0, 7.5, 12.0);
            }
            if (phi - 5.4).abs() < 0.5 && (theta - 0.45).abs() < 0.12 {
                color += Vec3::splat(4.0);
            }
            pixels.push(image::Rgb(color.to_array()));
        }
    }
    std::fs::create_dir_all("assets")?;
    image::codecs::hdr::HdrEncoder::new(std::io::BufWriter::new(std::fs::File::create(
        "assets/studio.hdr",
    )?))
    .encode(&pixels, width, height)?;
    println!("Generated assets/studio.hdr: {width}x{height}, linear HDR radiance > 1");
    Ok(())
}
