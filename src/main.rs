use glam::Vec3;
use renderer_project::{
    camera::Camera,
    material::Material,
    plane::Plane,
    render,
    scene::{PointLight, Scene},
    sphere::Sphere,
};
use std::{error::Error, path::PathBuf};

fn main() {
    if let Err(error) = run() {
        eprintln!("error: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    let mut width: u32 = 96;
    let mut height: u32 = 72;
    let mut output = PathBuf::from("output/smoke.png");
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "smoke" => {}
            "--width" => width = args.next().ok_or("--width needs a value")?.parse()?,
            "--height" => height = args.next().ok_or("--height needs a value")?.parse()?,
            "--output" => output = args.next().ok_or("--output needs a path")?.into(),
            "--help" | "-h" => {
                println!(
                    "Usage: renderer-project [smoke] [--width N] [--height N] [--output PATH]"
                );
                return Ok(());
            }
            _ => return Err(format!("unknown argument: {arg}; use --help").into()),
        }
    }
    if width == 0
        || height == 0
        || width > 8192
        || height > 8192
        || u64::from(width) * u64::from(height) > 16_777_216
    {
        return Err("dimensions must be 1..8192 and at most 16 megapixels".into());
    }
    let matte = |color| Material {
        diffuse: color,
        specular: Vec3::splat(0.3),
        shininess: 48.0,
    };
    let scene = Scene {
        shapes: vec![
            Box::new(Sphere::new(
                Vec3::new(-0.8, 1.0, 0.0),
                1.0,
                matte(Vec3::new(0.04, 0.55, 0.48)),
            )),
            Box::new(Sphere::new(
                Vec3::new(1.0, 0.7, 0.5),
                0.7,
                matte(Vec3::new(0.8, 0.2, 0.07)),
            )),
            Box::new(Plane::new(Vec3::ZERO, Vec3::Y, matte(Vec3::splat(0.35)))),
        ],
        lights: vec![PointLight {
            position: Vec3::new(-3.0, 5.0, 4.0),
            color: Vec3::ONE,
        }],
    };
    let camera = Camera::new(
        Vec3::new(4.0, 3.0, 7.0),
        Vec3::Y,
        Vec3::Y,
        width as f32 / height as f32,
        40.0,
    );
    if let Some(parent) = output.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent)?;
    }
    render::render(
        &camera,
        &scene,
        width,
        height,
        0.001,
        f32::INFINITY,
        [25, 30, 40],
    )
    .save(output.to_str().ok_or("output path is not UTF-8")?)?;
    println!("Rendered {width}x{height} -> {}", output.display());
    Ok(())
}
