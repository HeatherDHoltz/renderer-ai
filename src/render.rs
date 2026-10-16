use crate::{camera::Camera, film::Film, material::shade_pixel, scene::Scene};

pub struct TiledRenderer {
    pool: rayon::ThreadPool,
}
struct Tile {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    sums: Vec<glam::Vec3>,
}
impl TiledRenderer {
    pub fn new(settings: &crate::scene_io::RenderSettings) -> Result<Self, String> {
        settings.validate()?;
        let threads = if settings.threads == 0 {
            std::thread::available_parallelism().map_or(1, |n| n.get())
        } else {
            settings.threads
        };
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(threads)
            .thread_name(|i| format!("render-{i}"))
            .build()
            .map_err(|e| format!("cannot create render workers: {e}"))?;
        Ok(Self { pool })
    }
    pub fn thread_count(&self) -> usize {
        self.pool.current_num_threads()
    }
    pub fn render_range(
        &self,
        camera: &Camera,
        scene: &Scene,
        background: glam::Vec3,
        settings: &crate::scene_io::RenderSettings,
        film: &mut crate::film::LinearFilm,
        range: std::ops::Range<u32>,
    ) -> Result<(), String> {
        use rayon::prelude::*;
        settings.validate()?;
        if film.width != settings.width
            || film.height != settings.height
            || range.start > range.end
            || range.end > settings.spp
        {
            return Err("sample range or film dimensions do not match settings".into());
        }
        for y in 0..settings.height {
            for x in 0..settings.width {
                if film.sample_count(x, y) != range.start {
                    return Err("sample batch must continue the existing film prefix".into());
                }
            }
        }
        if range.is_empty() {
            return Ok(());
        }
        let integrator = settings.renderer()?;
        let cols = settings.width.div_ceil(settings.tile_size);
        let rows = settings.height.div_ceil(settings.tile_size);
        let base = &*film;
        let tiles: Vec<Tile> = self.pool.install(|| {
            (0..cols * rows)
                .into_par_iter()
                .map(|index| -> Result<Tile, String> {
                    let x0 = (index % cols) * settings.tile_size;
                    let y0 = (index / cols) * settings.tile_size;
                    let width = settings.tile_size.min(settings.width - x0);
                    let height = settings.tile_size.min(settings.height - y0);
                    let mut sums = Vec::with_capacity((width * height) as usize);
                    for y in y0..y0 + height {
                        for x in x0..x0 + width {
                            let (mut sum, _) = base.accumulation(x, y);
                            for sample in range.clone() {
                                let key = crate::sampling::SampleKey::new(
                                    settings.seed,
                                    u64::from(y) * u64::from(settings.width) + u64::from(x),
                                    sample,
                                );
                                let [dx, dy] = key.pixel_offset(settings.sampling);
                                let ray = camera.ray(
                                    (x as f32 + dx) / settings.width as f32,
                                    1.0 - (y as f32 + dy) / settings.height as f32,
                                );
                                let color = integrator.trace_sampled(&ray, scene, background, key);
                                if !color.is_finite() || color.min_element() < 0.0 {
                                    return Err(format!(
                                        "invalid radiance at pixel ({x},{y}), sample {sample}"
                                    ));
                                }
                                sum += color;
                            }
                            if !sum.is_finite() {
                                return Err(format!("radiance accumulation overflow at ({x},{y})"));
                            }
                            sums.push(sum);
                        }
                    }
                    Ok(Tile {
                        x: x0,
                        y: y0,
                        width,
                        height,
                        sums,
                    })
                })
                .collect::<Result<Vec<_>, _>>()
        })?;
        for tile in tiles {
            for y in 0..tile.height {
                for x in 0..tile.width {
                    film.set_accumulation(
                        tile.x + x,
                        tile.y + y,
                        tile.sums[(y * tile.width + x) as usize],
                        range.end,
                    )?;
                }
            }
        }
        Ok(())
    }
}

pub fn render_sampled(
    camera: &Camera,
    scene: &Scene,
    background: glam::Vec3,
    settings: &crate::scene_io::RenderSettings,
) -> Result<crate::film::LinearFilm, String> {
    let engine = TiledRenderer::new(settings)?;
    let mut film = crate::film::LinearFilm::new(settings.width, settings.height)?;
    engine.render_range(
        camera,
        scene,
        background,
        settings,
        &mut film,
        0..settings.spp,
    )?;
    Ok(film)
}

pub fn render_range(
    camera: &Camera,
    scene: &Scene,
    background: glam::Vec3,
    settings: &crate::scene_io::RenderSettings,
    film: &mut crate::film::LinearFilm,
    range: std::ops::Range<u32>,
) -> Result<(), String> {
    TiledRenderer::new(settings)?.render_range(camera, scene, background, settings, film, range)
}

pub fn render_progressive(
    camera: &Camera,
    scene: &Scene,
    background: glam::Vec3,
    settings: &crate::scene_io::RenderSettings,
    mut preview: impl FnMut(&crate::film::LinearFilm, u32) -> Result<(), String>,
) -> Result<crate::film::LinearFilm, String> {
    let engine = TiledRenderer::new(settings)?;
    let mut film = crate::film::LinearFilm::new(settings.width, settings.height)?;
    let mut start = 0;
    while start < settings.spp {
        let end = start
            .saturating_add(settings.preview_every)
            .min(settings.spp);
        engine.render_range(camera, scene, background, settings, &mut film, start..end)?;
        preview(&film, end)?;
        start = end;
    }
    Ok(film)
}

/// Write a complete PNG to a temporary sibling then atomically replace the preview.
pub fn save_preview(
    film: &crate::film::LinearFilm,
    settings: &crate::scene_io::RenderSettings,
    path: &std::path::Path,
) -> Result<(), String> {
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let name = path
        .file_name()
        .ok_or("output needs a filename")?
        .to_string_lossy();
    static NEXT_PREVIEW: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let id = NEXT_PREVIEW.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let temporary = path.with_file_name(format!(".{name}.{}.{id}.partial.png", std::process::id()));
    film.display(settings.exposure, settings.tone()?)?
        .save_with_format(&temporary, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    std::fs::rename(&temporary, path)
        .map_err(|e| format!("cannot replace preview {}: {e}", path.display()))?;
    Ok(())
}

pub fn render_linear(
    camera: &Camera,
    scene: &Scene,
    width: u32,
    height: u32,
    background: glam::Vec3,
) -> Result<crate::film::LinearFilm, String> {
    render_whitted(
        camera,
        scene,
        width,
        height,
        background,
        crate::integrator::Whitted::default(),
    )
}

pub fn render_whitted(
    camera: &Camera,
    scene: &Scene,
    width: u32,
    height: u32,
    background: glam::Vec3,
    integrator: crate::integrator::Whitted,
) -> Result<crate::film::LinearFilm, String> {
    let mut film = crate::film::LinearFilm::new(width, height)?;
    for y in 0..height {
        for x in 0..width {
            let ray = camera.ray(
                (x as f32 + 0.5) / width as f32,
                1.0 - (y as f32 + 0.5) / height as f32,
            );
            let color = integrator.trace(&ray, scene, background);
            film.add_sample(x, y, color)?;
        }
    }
    Ok(film)
}

pub fn render(
    camera: &Camera,
    scene: &Scene,
    width: u32,
    height: u32,
    t_min: f32,
    t_max: f32,
    background: [u8; 3],
) -> Film {
    let mut film = Film::new(width, height);
    for y in 0..height {
        for x in 0..width {
            let s = (x as f32 + 0.5) / width as f32;
            let t = 1.0 - (y as f32 + 0.5) / height as f32;
            let ray = camera.ray(s, t);
            let mut color = background;
            if let Some(hit) = scene.nearest_hit(&ray, t_min, t_max) {
                let shaded_color = shade_pixel(&hit, &ray, scene);
                let red = (shaded_color.x * 255.0).round() as u8;
                let green = (shaded_color.y * 255.0).round() as u8;
                let blue = (shaded_color.z * 255.0).round() as u8;
                color = [red, green, blue];
            }
            film.set_pixel(x, y, color);
        }
    }
    film
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{material::Material, sphere::Sphere};
    use glam::Vec3;

    fn material(color: Vec3) -> Material {
        Material {
            diffuse: color,
            specular: Vec3::ZERO,
            shininess: 32.0,
            ..Default::default()
        }
    }

    #[test]
    fn empty_scene() {
        let camera = Camera::new(Vec3::ZERO, -Vec3::Z, Vec3::Y, 1.0, 90.0);
        let scene = Scene {
            shapes: vec![],
            lights: vec![],
            textures: vec![],
            area_lights: vec![],
            acceleration: None,
            environment: None,
        };
        let film = render(&camera, &scene, 2, 2, 0.001, 100.0, [80, 120, 200]);
        for y in 0..2 {
            for x in 0..2 {
                assert_eq!(film.get_pixel(x, y), [80, 120, 200]);
            }
        }
    }

    #[test]
    fn top_pixel_hits_upper_sphere() {
        let camera = Camera::new(Vec3::ZERO, -Vec3::Z, Vec3::Y, 1.0, 90.0);
        let scene = Scene {
            shapes: vec![Box::new(Sphere::new(
                Vec3::new(0.0, 2.0, -3.0),
                0.4,
                material(Vec3::X),
            ))],
            lights: vec![],
            textures: vec![],
            area_lights: vec![],
            acceleration: None,
            environment: None,
        };
        let film = render(&camera, &scene, 3, 3, 0.001, 100.0, [25, 30, 40]);
        assert_eq!(film.get_pixel(1, 0), [69, 0, 0]);
        assert_eq!(film.get_pixel(1, 2), [25, 30, 40]);
    }

    #[test]
    fn nearest_sphere() {
        let camera = Camera::new(Vec3::new(0.0, 0.0, 5.0), Vec3::ZERO, Vec3::Y, 1.0, 45.0);
        let mut scene = Scene {
            shapes: vec![
                Box::new(Sphere::new(Vec3::ZERO, 1.0, material(Vec3::X))),
                Box::new(Sphere::new(
                    Vec3::new(0.0, 0.0, 2.0),
                    1.0,
                    material(Vec3::Y),
                )),
            ],
            lights: vec![],
            textures: vec![],
            area_lights: vec![],
            acceleration: None,
            environment: None,
        };
        assert_eq!(
            render(&camera, &scene, 1, 1, 0.001, 100.0, [25, 30, 40]).get_pixel(0, 0),
            [0, 69, 0]
        );
        scene.shapes.reverse();
        assert_eq!(
            render(&camera, &scene, 1, 1, 0.001, 100.0, [25, 30, 40]).get_pixel(0, 0),
            [0, 69, 0]
        );
    }
}
