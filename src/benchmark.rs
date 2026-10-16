//! Reproducible single-thread intersection workload; statistics outside timed loops.
use crate::{
    accel::{AccelKind, TraceStats},
    ray::Ray,
    scene::Scene,
    scene_io::{BuildTimings, SceneFile},
};
use serde::Serialize;
use std::{path::Path, process::Command, time::Instant};

#[derive(Serialize)]
pub struct BenchmarkReport {
    pub source_commit: String,
    pub tracked_source_dirty: bool,
    pub rustc: String,
    pub os: String,
    pub architecture: String,
    pub machine: String,
    pub cpu: String,
    pub logical_cpus: String,
    pub scene: String,
    pub scene_fnv1a64: String,
    pub seed: u64,
    pub ray_count: usize,
    pub image_dimensions: [u32; 2],
    pub instance_count: usize,
    pub instanced_primitive_count: usize,
    pub instanced_triangle_count: usize,
    pub workload: String,
    pub profile: String,
    pub threads: usize,
    pub warmups: usize,
    pub runs: usize,
    pub backend_results: Vec<BackendResult>,
}
#[derive(Serialize)]
pub struct BackendResult {
    pub backend: AccelKind,
    pub parse_seconds: f64,
    pub build: BuildTimings,
    pub query_seconds: Vec<f64>,
    pub median_seconds: f64,
    pub min_seconds: f64,
    pub max_seconds: f64,
    pub stats: TraceStats,
    pub checksum: u64,
}

fn command(program: &str, args: &[&str]) -> String {
    Command::new(program)
        .args(args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "unavailable".into())
}
fn hash(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325, |h, b| {
        (h ^ u64::from(*b)).wrapping_mul(0x100000001b3)
    })
}
fn random(seed: &mut u64) -> f32 {
    *seed = seed.wrapping_add(0x9e3779b97f4a7c15);
    let mut x = *seed;
    x = (x ^ (x >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94d049bb133111eb);
    ((x ^ (x >> 31)) >> 40) as f32 / 16_777_216.0
}
fn checksum(scene: &Scene, rays: &[Ray]) -> u64 {
    let mut value = 0u64;
    for ray in rays {
        if let Some(hit) = scene.nearest_hit(ray, 0.0001, f32::INFINITY) {
            value = value.wrapping_add(
                u64::from(hit.t.to_bits())
                    ^ (hit.object_id as u64).rotate_left(16)
                    ^ (hit.primitive_id as u64).rotate_left(32),
            );
        }
        value = value.wrapping_add(scene.occluded(ray, 0.0001, 100.0) as u64);
    }
    std::hint::black_box(value)
}

pub fn run(
    path: &Path,
    ray_count: usize,
    runs: usize,
    warmups: usize,
) -> Result<BenchmarkReport, String> {
    if !(1..=1_000_000).contains(&ray_count)
        || !(3..=20).contains(&runs)
        || !(1..=5).contains(&warmups)
    {
        return Err("benchmark needs 1..1M rays, 3..20 runs, and 1..5 warmups".into());
    }
    if cfg!(debug_assertions) {
        return Err("benchmark requires a release build".into());
    }
    let text = std::fs::read(path).map_err(|e| e.to_string())?;
    let mut file = SceneFile::load(path)?;
    let base = path.parent().unwrap_or(Path::new("."));
    file.render.accel = AccelKind::None;
    let reference = file.build(base)?;
    let mut seed = file.render.seed;
    let side = (ray_count as f64).sqrt().ceil() as usize;
    let rays: Vec<_> = (0..ray_count)
        .map(|i| {
            reference.camera.ray(
                ((i % side) as f32 + random(&mut seed)) / side as f32,
                ((i / side) as f32 + random(&mut seed)) / side as f32,
            )
        })
        .collect();
    let expected: Vec<_> = rays
        .iter()
        .map(|ray| {
            (
                reference
                    .scene
                    .nearest_hit(ray, 0.0001, f32::INFINITY)
                    .map(|h| (h.t, h.object_id, h.primitive_id)),
                reference.scene.occluded(ray, 0.0001, 100.0),
            )
        })
        .collect();
    let mut report=BenchmarkReport {source_commit:command("git",&["rev-parse","HEAD"]),tracked_source_dirty:!command("git",&["diff","--name-only","HEAD"]).is_empty(),rustc:command("rustc",&["--version"]),os:command("sw_vers",&["-productVersion"]),architecture:std::env::consts::ARCH.into(),machine:command("sysctl",&["-n","hw.model"]),cpu:command("sysctl",&["-n","machdep.cpu.brand_string"]),logical_cpus:command("sysctl",&["-n","hw.ncpu"]),scene:path.display().to_string(),scene_fnv1a64:format!("{:016x}",hash(&text)),seed:file.render.seed,ray_count,image_dimensions:[file.render.width,file.render.height],instance_count:reference.scene.shapes.len(),instanced_primitive_count:reference.scene.shapes.iter().map(|s|s.primitive_count()).sum(),instanced_triangle_count:reference.scene.shapes.iter().map(|s|s.triangle_count()).sum(),workload:"Each camera ray: closest hit [0.0001,infinity] plus any hit [0.0001,100]. Seeded jittered square film grid; single-thread intersection queries, no shading, bounces, light samples, or output writes. Stats collected separately; all per-ray results compared before timing.".into(),profile:"release".into(),threads:1,warmups,runs,backend_results:vec![]};
    for kind in [AccelKind::None, AccelKind::Bvh, AccelKind::Octree] {
        let parse_start = Instant::now();
        let mut file = SceneFile::load(path)?;
        let parse_seconds = parse_start.elapsed().as_secs_f64();
        file.render.accel = kind;
        let loaded = file.build(base)?;
        let mut stats = TraceStats::default();
        for (i, ray) in rays.iter().enumerate() {
            let hit = loaded
                .scene
                .nearest_hit_with_stats(ray, 0.0001, f32::INFINITY, &mut stats);
            let actual = hit.as_ref().map(|h| (h.t, h.object_id, h.primitive_id));
            let equal = match (expected[i].0, actual) {
                (None, None) => true,
                (Some((a, id, p)), Some((b, j, q))) => {
                    (a - b).abs() <= 1e-5 * a.abs().max(1.0) && id == j && p == q
                }
                _ => false,
            };
            if !equal
                || loaded
                    .scene
                    .occluded_with_stats(ray, 0.0001, 100.0, &mut stats)
                    != expected[i].1
            {
                return Err(format!(
                    "backend {kind:?} disagrees with brute force on ray {i}"
                ));
            }
        }
        for _ in 0..warmups {
            checksum(&loaded.scene, &rays);
        }
        let mut query_seconds = vec![];
        let mut last_checksum = 0;
        for _ in 0..runs {
            let start = Instant::now();
            last_checksum = checksum(&loaded.scene, &rays);
            query_seconds.push(start.elapsed().as_secs_f64());
        }
        let mut sorted = query_seconds.clone();
        sorted.sort_by(f64::total_cmp);
        let median = if runs.is_multiple_of(2) {
            (sorted[runs / 2 - 1] + sorted[runs / 2]) * 0.5
        } else {
            sorted[runs / 2]
        };
        report.backend_results.push(BackendResult {
            backend: kind,
            parse_seconds,
            build: loaded.build_timings,
            query_seconds,
            median_seconds: median,
            min_seconds: sorted[0],
            max_seconds: sorted[runs - 1],
            stats,
            checksum: last_checksum,
        });
    }
    Ok(report)
}
