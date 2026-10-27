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
#[command(version, about = "The Diamond Express — offline Rust renderer")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}
#[derive(Subcommand)]
enum Command {
    /// Generate an ordinary validated scene from a bounded offline config.
    Generate {
        config: PathBuf,
        #[arg(long, default_value = "output/generated-scene.json")]
        output: PathBuf,
        #[arg(long)]
        seed: Option<u64>,
    },
    /// Render an inclusive frame range with fresh transforms and bounds at every time.
    Animate {
        scene: PathBuf,
        #[arg(long, default_value = "output/frames")]
        output: PathBuf,
        #[arg(long, default_value = "0:60")]
        frames: renderer_project::animation::FrameRange,
        #[arg(long, default_value_t = 24.0)]
        fps: f64,
        #[arg(long, default_value_t = 0.0, allow_hyphen_values = true)]
        start_time: f64,
        #[arg(long)]
        width: Option<u32>,
        #[arg(long)]
        height: Option<u32>,
        #[arg(long)]
        spp: Option<u32>,
        #[arg(long)]
        threads: Option<usize>,
        /// Also save raw linear RGBE for every completed frame.
        #[arg(long)]
        hdr: bool,
    },
    /// Measure full-render thread scaling with exact linear-film verification.
    BenchmarkRender {
        scene: PathBuf,
        #[arg(long, default_value = "output/render-benchmark.json")]
        output: PathBuf,
        #[arg(long, value_delimiter = ',', default_value = "1,2,4,0")]
        threads: Vec<usize>,
        #[arg(long, default_value_t = 5)]
        runs: usize,
        #[arg(long, default_value_t = 1)]
        warmups: usize,
    },
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
        #[arg(long)]
        threads: Option<usize>,
        #[arg(long)]
        tile_size: Option<u32>,
        #[arg(long)]
        progressive: bool,
        #[arg(long, conflicts_with = "progressive")]
        no_progressive: bool,
        #[arg(long)]
        preview_every: Option<u32>,
        #[arg(long, allow_hyphen_values = true)]
        exposure: Option<f32>,
        #[arg(long)]
        hdr_output: Option<PathBuf>,
        #[arg(long)]
        integrator: Option<String>,
        #[arg(long, default_value_t = 0.0, allow_hyphen_values = true)]
        time: f64,
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
        Command::Generate {
            config,
            output,
            seed,
        } => {
            let mut config = renderer_project::procedural::GeneratorFile::load(&config)?;
            if let Some(v) = seed {
                config.seed = v;
            }
            let file = config.generate()?;
            if let Some(parent) = output.parent().filter(|p| !p.as_os_str().is_empty()) {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&output, serde_json::to_vec_pretty(&file)?)?;
            println!(
                "Generated {} objects with seed {} -> {}",
                file.objects.len(),
                config.seed,
                output.display()
            );
            Ok(())
        }
        Command::Animate {
            scene,
            output,
            frames,
            fps,
            start_time,
            width,
            height,
            spp,
            threads,
            hdr,
        } => {
            let mut file = SceneFile::load(&scene)?;
            if let Some(v) = width {
                file.render.width = v;
            }
            if let Some(v) = height {
                file.render.height = v;
            }
            if let Some(v) = spp {
                file.render.spp = v;
            }
            if let Some(v) = threads {
                file.render.threads = v;
            }
            renderer_project::animation::render_sequence(
                &file,
                scene.parent().unwrap_or(Path::new(".")),
                &output,
                frames,
                fps,
                start_time,
                hdr,
            )?;
            Ok(())
        }
        Command::BenchmarkRender {
            scene,
            output,
            threads,
            runs,
            warmups,
        } => {
            let report = renderer_project::benchmark::render_run(&scene, &threads, runs, warmups)?;
            if let Some(parent) = output.parent().filter(|p| !p.as_os_str().is_empty()) {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&output, serde_json::to_string_pretty(&report)?)?;
            for row in &report.thread_results {
                println!(
                    "{} workers: median {:.3}s, range {:.3}..{:.3}s",
                    row.actual_threads, row.median_seconds, row.min_seconds, row.max_seconds
                );
            }
            println!("Saved verified full-render timings -> {}", output.display());
            Ok(())
        }
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
            threads,
            tile_size,
            progressive,
            no_progressive,
            preview_every,
            hdr_output,
            integrator,
            time,
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
            if let Some(v) = threads {
                file.render.threads = v;
            }
            if let Some(v) = tile_size {
                file.render.tile_size = v;
            }
            if progressive {
                file.render.progressive = true;
            }
            if no_progressive {
                file.render.progressive = false;
            }
            if let Some(v) = preview_every {
                file.render.preview_every = v;
            }
            if let Some(v) = integrator {
                file.render.integrator = v;
            }
            let loaded = file.build_at(scene.parent().unwrap_or(Path::new(".")), time)?;
            let load_time = start.elapsed();
            if !output
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("png"))
            {
                return Err("output must be a .png path".into());
            }
            let workers = if loaded.render.threads == 0 {
                std::thread::available_parallelism().map_or(1, |n| n.get())
            } else {
                loaded.render.threads
            };
            eprintln!(
                "Rendering {}x{}, {} spp, {workers} workers, {}px tiles",
                loaded.render.width,
                loaded.render.height,
                loaded.render.spp,
                loaded.render.tile_size
            );
            if hdr_output
                .as_ref()
                .is_some_and(|p| !p.extension().is_some_and(|e| e.eq_ignore_ascii_case("hdr")))
            {
                return Err("--hdr-output must use .hdr extension".into());
            }
            let start = Instant::now();
            let mut write_time = std::time::Duration::ZERO;
            if loaded.render.progressive {
                render::render_progressive(
                    &loaded.camera,
                    &loaded.scene,
                    loaded.background,
                    &loaded.render,
                    |film, samples| {
                        let write_start = Instant::now();
                        render::save_preview(film, &loaded.render, &output)?;
                        if samples == loaded.render.spp
                            && let Some(path) = &hdr_output
                        {
                            film.save_hdr(path)?;
                        }
                        write_time += write_start.elapsed();
                        eprintln!(
                            "Preview {samples}/{} spp -> {} ({:.2}s elapsed)",
                            loaded.render.spp,
                            output.display(),
                            start.elapsed().as_secs_f64()
                        );
                        Ok(())
                    },
                )?;
            } else {
                let film = loaded.render()?;
                let write_start = Instant::now();
                render::save_preview(&film, &loaded.render, &output)?;
                if let Some(path) = &hdr_output {
                    film.save_hdr(path)?;
                }
                write_time = write_start.elapsed();
            }
            let render_time = start.elapsed().saturating_sub(write_time);
            println!(
                "Rendered {}x{} at {} spp -> {} (load {:.3}s, render {:.3}s, write {:.3}s, {workers} workers)",
                loaded.render.width,
                loaded.render.height,
                loaded.render.spp,
                output.display(),
                load_time.as_secs_f64(),
                render_time.as_secs_f64(),
                write_time.as_secs_f64()
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
        environment: None,
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
