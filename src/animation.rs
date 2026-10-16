//! Bounded TRS keyframes and deterministic, static-per-frame image sequences.
use crate::{scene_io::SceneFile, transform::Transform};
use glam::{Mat4, Quat, Vec3};
use serde::{Deserialize, Serialize};
use std::{path::Path, str::FromStr, time::Instant};

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TransformTrack {
    pub keyframes: Vec<Keyframe>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Keyframe {
    pub time: f64,
    pub translation: [f32; 3],
    /// Unit quaternion in x,y,z,w order, not Euler angles.
    pub rotation: [f32; 4],
    pub scale: [f32; 3],
}
pub fn validate_time(time: f64) -> Result<(), String> {
    if !time.is_finite() || time.abs() > 1e6 {
        return Err("animation time must be finite seconds in [-1000000,1000000]".into());
    }
    Ok(())
}
impl TransformTrack {
    pub fn validate(&self) -> Result<(), String> {
        if self.keyframes.is_empty() || self.keyframes.len() > 4096 {
            return Err("animation track needs 1..4096 keyframes".into());
        }
        for (i, k) in self.keyframes.iter().enumerate() {
            validate_time(k.time)?;
            let q = Quat::from_array(k.rotation);
            if !q.is_finite() || (q.length_squared() - 1.0).abs() > 1e-3 {
                return Err(format!(
                    "keyframe {i}: rotation must be a unit x,y,z,w quaternion"
                ));
            }
            Transform::new(Mat4::from_scale_rotation_translation(
                k.scale.into(),
                q.normalize(),
                k.translation.into(),
            ))
            .map_err(|e| format!("keyframe {i}: {e}"))?;
            if i > 0 {
                let previous = &self.keyframes[i - 1];
                if k.time <= previous.time {
                    return Err(
                        "keyframe times must be strictly increasing; duplicates are invalid".into(),
                    );
                }
                if k.scale
                    .iter()
                    .zip(previous.scale)
                    .any(|(a, b)| a.signum() != b.signum())
                {
                    return Err(
                        "animated scale cannot change sign across a segment (singular crossing)"
                            .into(),
                    );
                }
            }
        }
        Ok(())
    }
    /// Validates the whole track, including unvisited segments, before evaluation.
    pub fn matrix_at(&self, time: f64) -> Result<Mat4, String> {
        self.validate()?;
        validate_time(time)?;
        let index = self.keyframes.partition_point(|k| k.time <= time);
        let a = &self.keyframes[index.saturating_sub(1)];
        let b = &self.keyframes[index.min(self.keyframes.len() - 1)];
        let t = if a.time == b.time {
            0.0
        } else {
            ((time - a.time) / (b.time - a.time)).clamp(0.0, 1.0) as f32
        };
        let qa = Quat::from_array(a.rotation).normalize();
        let mut qb = Quat::from_array(b.rotation).normalize();
        if qa.dot(qb) < 0.0 {
            qb = -qb;
        }
        let rotation = if qa.dot(qb) > 0.9995 {
            qa.lerp(qb, t).normalize()
        } else {
            qa.slerp(qb, t).normalize()
        };
        let matrix = Mat4::from_scale_rotation_translation(
            Vec3::from_array(a.scale).lerp(b.scale.into(), t),
            rotation,
            Vec3::from_array(a.translation).lerp(b.translation.into(), t),
        );
        Transform::new(matrix)?;
        Ok(matrix)
    }
}

#[derive(Clone, Copy, Debug)]
pub struct FrameRange {
    pub first: u32,
    pub last: u32,
}
impl FromStr for FrameRange {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, String> {
        let (a, b) = s
            .split_once(':')
            .ok_or("frames must be FIRST:LAST (inclusive)")?;
        let range = Self {
            first: a.parse().map_err(|_| "invalid first frame")?,
            last: b.parse().map_err(|_| "invalid last frame")?,
        };
        range.validate()?;
        Ok(range)
    }
}
impl FrameRange {
    pub fn validate(self) -> Result<(), String> {
        if self.first > self.last || self.last > 1_000_000 || self.last - self.first >= 10_000 {
            return Err("frames must be ordered, <=1000000, and at most 10000 frames".into());
        }
        Ok(())
    }
    pub fn times(self, fps: f64, start_time: f64) -> Result<Vec<(u32, f64)>, String> {
        self.validate()?;
        if !fps.is_finite() || !(0.001..=1000.0).contains(&fps) {
            return Err("fps must be finite in [0.001,1000]".into());
        }
        validate_time(start_time)?;
        let times: Vec<_> = (self.first..=self.last)
            .map(|frame| (frame, start_time + frame as f64 / fps))
            .collect();
        validate_time(times.last().expect("nonempty").1)?;
        Ok(times)
    }
}

#[derive(Serialize)]
struct FrameEvidence {
    frame: u32,
    time_seconds: f64,
    png: String,
    build_seconds: f64,
    render_write_seconds: f64,
}
/// Rebuilds a complete immutable scene and acceleration at each time; no stale bounds.
pub fn render_sequence(
    file: &SceneFile,
    base: &Path,
    output: &Path,
    range: FrameRange,
    fps: f64,
    start_time: f64,
    hdr: bool,
) -> Result<(), String> {
    let times = range.times(fps, start_time)?;
    file.render.validate()?;
    let samples = file.render.width as u64 * file.render.height as u64 * file.render.spp as u64;
    if samples * times.len() as u64 > 1u64 << 36 {
        return Err("animation exceeds 2^36 total camera samples; split the sequence".into());
    }
    let mut evidence = Vec::new();
    for (frame, time) in times {
        let loaded = file.build_at(base, time)?;
        let name = format!("frame-{frame:06}.png");
        let path = output.join(&name);
        let hdr_path = output.join(format!("frame-{frame:06}.hdr"));
        let start = Instant::now();
        if loaded.render.progressive {
            crate::render::render_progressive(
                &loaded.camera,
                &loaded.scene,
                loaded.background,
                &loaded.render,
                |film, spp| {
                    crate::render::save_preview(film, &loaded.render, &path)?;
                    if hdr && spp == loaded.render.spp {
                        film.save_hdr(&hdr_path)?;
                    }
                    Ok(())
                },
            )?;
        } else {
            let film = loaded.render()?;
            crate::render::save_preview(&film, &loaded.render, &path)?;
            if hdr {
                film.save_hdr(&hdr_path)?;
            }
        }
        evidence.push(FrameEvidence {
            frame,
            time_seconds: time,
            png: name,
            build_seconds: loaded.build_timings.total_seconds,
            render_write_seconds: start.elapsed().as_secs_f64(),
        });
        // A manifest describes only frames completed by this invocation.
        let manifest = serde_json::json!({"version":1,"fps":fps,"start_time_seconds":start_time,
            "render":file.render,"hdr":hdr,"frames":evidence});
        let temporary = output.join(format!(".animation-{}.tmp", std::process::id()));
        std::fs::write(
            &temporary,
            serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        std::fs::rename(temporary, output.join("animation.json")).map_err(|e| e.to_string())?;
        eprintln!("Frame {frame} at {time:.6}s -> {}", path.display());
    }
    Ok(())
}
