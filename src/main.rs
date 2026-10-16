use clap::{Parser, Subcommand};
use glam::Vec3;
use renderer_project::{
    camera::Camera,
    material::Material,
    plane::Plane,
    render,
    scene::{PointLight, Scene},
    scene_io::{RenderSettings, SceneFile},
    sphere::Sphere,
};
use std::{
    error::Error,
    path::{Path, PathBuf},
    time::Instant,
};

#[derive(Parser)]
#[command(version, about = "A reproducible educational Rust CPU renderer")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}
#[derive(Subcommand)]
enum Command {
    /// Compare verified brute-force, BVH, and octree ray-query workloads (release only).
    Benchmark {
        scene: PathBuf,
        #[arg(long, default_value = "output/benchmark.json")]
        output: PathBuf,
        #[arg(long, default_value_t = 4096)]
        rays: usize,
        #[arg(long, default_value_t = 5)]
        runs: usize,
        #[arg(long, default_value_t = 1)]
        warmups: usize,
    },
    /// Render the built-in small smoke scene.
    Smoke {
        #[arg(long, default_value_t = 96)]
        width: u32,
        #[arg(long, default_value_t = 72)]
        height: u32,
        #[arg(long, default_value = "output/smoke.png")]
        output: PathBuf,
    },
    /// Validate a versioned JSON scene including all referenced assets.
    Validate { scene: PathBuf },
    /// Render a versioned JSON scene to an sRGB PNG.
    Render {
        scene: PathBuf,
        #[arg(long, default_value = "output/render.png")]
        output: PathBuf,
        #[arg(long)]
        width: Option<u32>,
        #[arg(long)]
        height: Option<u32>,
        #[arg(long)]
        depth: Option<u32>,
        #[arg(long, value_enum)]
        accel: Option<renderer_project::accel::AccelKind>,
        #[arg(long)]
        spp: Option<u32>,
        #[arg(long)]
        seed: Option<u64>,
        #[arg(long, value_enum)]
        sampling: Option<renderer_project::sampling::PixelSampling>,
        #[arg(long, allow_hyphen_values = true)]
        exposure: Option<f32>,
    },
}
fn main() {
    if let Err(error) = run() {
        eprintln!("error: {error}");
        std::process::exit(1);
    }
}
fn run() -> Result<(), Box<dyn Error>> {
    match Cli::parse().command {
        Command::Benchmark {
            scene,
            output,
            rays,
            runs,
            warmups,
        } => {
            let report = renderer_project::benchmark::run(&scene, rays, runs, warmups)?;
            if let Some(parent) = output.parent().filter(|p| !p.as_os_str().is_empty()) {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&output, serde_json::to_string_pretty(&report)?)?;
            for result in &report.backend_results {
                println!(
                    "{:?}: median {:.3} ms (range {:.3}..{:.3}); {} primitive tests",
                    result.backend,
                    result.median_seconds * 1000.0,
                    result.min_seconds * 1000.0,
                    result.max_seconds * 1000.0,
                    result.stats.primitive_tests
                );
            }
            println!("Saved verified benchmark -> {}", output.display());
            Ok(())
        }
        Command::Smoke {
            width,
            height,
            output,
        } => smoke(width, height, output),
        Command::Validate { scene } => {
            let file = SceneFile::load(&scene)?;
            let loaded = file.build(scene.parent().unwrap_or(Path::new(".")))?;
            println!(
                "Valid v{} scene: {} instances, {} point lights, {} rectangular lights, {} textures; {}x{}",
                file.version,
                loaded.scene.shapes.len(),
                loaded.scene.lights.len(),
                loaded.scene.area_lights.len(),
                loaded.scene.textures.len(),
                loaded.render.width,
                loaded.render.height
            );
            Ok(())
        }
        Command::Render {
            scene,
            output,
            width,
            height,
            depth,
            exposure,
            accel,
            spp,
            seed,
            sampling,
        } => {
            let start = Instant::now();
            let mut file = SceneFile::load(&scene)?;
            if let Some(v) = width {
                file.render.width = v;
            }
            if let Some(v) = height {
                file.render.height = v;
            }
            if let Some(v) = depth {
                file.render.max_depth = v;
            }
            if let Some(v) = exposure {
                file.render.exposure = v;
            }
            if let Some(v) = accel {
                file.render.accel = v;
            }
            if let Some(v) = spp {
                file.render.spp = v;
            }
            if let Some(v) = seed {
                file.render.seed = v;
            }
            if let Some(v) = sampling {
                file.render.sampling = v;
            }
            let loaded = file.build(scene.parent().unwrap_or(Path::new(".")))?;
            let load_time = start.elapsed();
            let start = Instant::now();
            let film = loaded.render()?;
            let render_time = start.elapsed();
            if let Some(parent) = output.parent().filter(|p| !p.as_os_str().is_empty()) {
                std::fs::create_dir_all(parent)?;
            }
            let start = Instant::now();
            film.display(loaded.render.exposure, loaded.render.tone()?)?
                .save(&output)?;
            println!(
                "Rendered {}x{} at {} spp -> {} (load {:.3}s, render {:.3}s, write {:.3}s)",
                loaded.render.width,
                loaded.render.height,
                loaded.render.spp,
                output.display(),
                load_time.as_secs_f64(),
                render_time.as_secs_f64(),
                start.elapsed().as_secs_f64()
            );
            Ok(())
        }
    }
}
fn smoke(width: u32, height: u32, output: PathBuf) -> Result<(), Box<dyn Error>> {
    RenderSettings {
        width,
        height,
        ..RenderSettings::default()
    }
    .validate()?;
    let matte = |color| Material {
        diffuse: color,
        specular: Vec3::splat(0.3),
        shininess: 48.0,
        ..Default::default()
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
        textures: vec![],
        area_lights: vec![],
        acceleration: None,
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
    render::render_linear(&camera, &scene, width, height, Vec3::new(0.03, 0.04, 0.06))?
        .display(0.0, renderer_project::film::ToneMap::Reinhard)?
        .save(&output)?;
    println!("Rendered {width}x{height} -> {}", output.display());
    Ok(())
}
