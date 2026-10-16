use crate::{camera::Camera, film::Film, material::shade_pixel, scene::Scene};

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
