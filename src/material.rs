use crate::{ray::Ray, scene::Scene, shape::Hit};
use glam::Vec3;

#[derive(Clone, Copy)]
pub struct Material {
    pub diffuse: Vec3,
    pub specular: Vec3,
    pub shininess: f32,
}

pub fn shade_pixel(hit: &Hit, view_ray: &Ray, scene: &Scene) -> Vec3 {
    shade_linear(hit, view_ray, scene).clamp(Vec3::ZERO, Vec3::ONE)
}

pub fn shade_linear(hit: &Hit, view_ray: &Ray, scene: &Scene) -> Vec3 {
    let mut color = 0.27 * hit.material.diffuse; // ambient default color
    let view = -view_ray.direction().normalize(); // view now points to camera
    let normal = hit.normal;

    for light in &scene.lights {
        let to_light = light.position - hit.point;
        let distance = to_light.length();
        if distance <= 0.001 {
            continue;
        }
        let direction = to_light.normalize(); // points to light
        let diffuse = normal.dot(direction).max(0.0);
        if diffuse == 0.0 {
            continue;
        }

        let shadow_ray = Ray::new(hit.point, direction);
        if scene.occluded(&shadow_ray, 0.001, distance - 0.001) {
            continue;
        }

        let halfway = (view + direction).normalize_or_zero();
        let specular = normal.dot(halfway).max(0.0).powf(hit.material.shininess);
        let diffuse_color = light.color * hit.material.diffuse * diffuse;
        let specular_color = light.color * hit.material.specular * specular;
        color += diffuse_color + specular_color;
    }
    color
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{scene::PointLight, sphere::Sphere};

    fn surface() -> Hit {
        Hit::new(
            &Ray::new(Vec3::Y, -Vec3::Y),
            1.0,
            Vec3::Y,
            Material {
                diffuse: Vec3::splat(0.4),
                specular: Vec3::ZERO,
                shininess: 32.0,
            },
            glam::Vec2::ZERO,
        )
    }

    fn scene() -> Scene {
        Scene {
            shapes: vec![],
            lights: vec![PointLight {
                position: 4.0 * Vec3::Y,
                color: Vec3::ONE,
            }],
        }
    }

    #[test]
    fn diffuse_and_specular() {
        let mut hit = surface();
        let ray = Ray::new(Vec3::Y, -Vec3::Y);
        let scene = scene();
        assert!((shade_pixel(&hit, &ray, &scene) - Vec3::splat(0.508)).length() < 0.0001);
        hit.material.specular = Vec3::splat(0.2);
        assert!((shade_pixel(&hit, &ray, &scene) - Vec3::splat(0.708)).length() < 0.0001);
    }

    #[test]
    fn blocker_before_and_beyond_light() {
        let hit = surface();
        let ray = Ray::new(Vec3::Y, -Vec3::Y);
        let mut scene = scene();
        scene
            .shapes
            .push(Box::new(Sphere::new(2.0 * Vec3::Y, 0.5, hit.material)));
        assert!((shade_pixel(&hit, &ray, &scene) - Vec3::splat(0.108)).length() < 0.0001);
        scene.shapes.clear();
        scene
            .shapes
            .push(Box::new(Sphere::new(6.0 * Vec3::Y, 0.5, hit.material)));
        assert!((shade_pixel(&hit, &ray, &scene) - Vec3::splat(0.508)).length() < 0.0001);
    }

    #[test]
    fn multiple_lights_and_backside() {
        let hit = surface();
        let ray = Ray::new(Vec3::Y, -Vec3::Y);
        let mut scene = scene();
        scene.lights.push(PointLight {
            position: -4.0 * Vec3::Y,
            color: Vec3::ONE,
        });
        assert!((shade_pixel(&hit, &ray, &scene) - Vec3::splat(0.508)).length() < 0.0001);
        scene.lights[1].position = 4.0 * Vec3::Y;
        assert!((shade_pixel(&hit, &ray, &scene) - Vec3::splat(0.908)).length() < 0.0001);
    }
}
