use crate::{ray::Ray, scene::Scene, shape::Hit};
use glam::Vec3;

#[derive(Clone, Copy)]
pub struct Material {
    pub diffuse: Vec3,
    pub specular: Vec3,
    pub shininess: f32,
    pub reflection: Vec3,
    pub transmission: Vec3,
    pub ior: f32,
    pub texture: Option<usize>,
    pub physical: Option<crate::pbr::PhysicalMaterial>,
}

impl Default for Material {
    fn default() -> Self {
        Self {
            diffuse: Vec3::splat(0.7),
            specular: Vec3::ZERO,
            shininess: 32.0,
            reflection: Vec3::ZERO,
            transmission: Vec3::ZERO,
            ior: 1.5,
            texture: None,
            physical: None,
        }
    }
}

impl Material {
    pub fn mirror(tint: Vec3) -> Self {
        Self {
            diffuse: Vec3::ZERO,
            reflection: tint,
            ..Self::default()
        }
    }
    pub fn glass(tint: Vec3, ior: f32) -> Self {
        Self {
            diffuse: Vec3::ZERO,
            transmission: tint,
            ior,
            ..Self::default()
        }
    }
    pub fn validate(&self) -> Result<(), String> {
        if let Some(physical) = self.physical {
            physical.validate()?;
        }
        for color in [
            self.diffuse,
            self.specular,
            self.reflection,
            self.transmission,
        ] {
            if !color.is_finite() || color.min_element() < 0.0 || color.max_element() > 1.0 {
                return Err("material coefficients must be finite RGB in [0,1]".into());
            }
        }
        if !self.shininess.is_finite()
            || self.shininess < 0.0
            || !self.ior.is_finite()
            || self.ior < 1.0
            || self.ior > 4.0
        {
            return Err("material requires shininess >= 0 and IOR in [1,4]".into());
        }
        Ok(())
    }
}

pub fn shade_pixel(hit: &Hit, view_ray: &Ray, scene: &Scene) -> Vec3 {
    shade_linear(hit, view_ray, scene).clamp(Vec3::ZERO, Vec3::ONE)
}

pub fn shade_linear(hit: &Hit, view_ray: &Ray, scene: &Scene) -> Vec3 {
    shade_sampled(hit, view_ray, scene, crate::sampling::SampleKey::default())
}

pub fn shade_sampled(
    hit: &Hit,
    view_ray: &Ray,
    scene: &Scene,
    key: crate::sampling::SampleKey,
) -> Vec3 {
    let diffuse_color = hit.material.diffuse
        * hit
            .material
            .texture
            .map_or(Vec3::ONE, |id| scene.textures[id].sample(hit.uv));
    let mut color = 0.27 * diffuse_color; // ambient default color
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

        let origin = crate::integrator::offset_origin(hit.point, hit.outward_normal, direction);
        let to_sample = light.position - origin;
        let shadow_ray = Ray::new(origin, to_sample.normalize());
        if scene.occluded(&shadow_ray, 0.0, to_sample.length().next_down()) {
            continue;
        }

        let halfway = (view + direction).normalize_or_zero();
        let specular = normal.dot(halfway).max(0.0).powf(hit.material.shininess);
        let diffuse_color = light.color * diffuse_color * diffuse;
        let specular_color = light.color * hit.material.specular * specular;
        color += diffuse_color + specular_color;
    }
    for (id, light) in scene.area_lights.iter().enumerate() {
        let uv = glam::Vec2::new(key.value(2 + 2 * id as u64), key.value(3 + 2 * id as u64));
        let Some(sample) = light.sample(hit.point, uv) else {
            continue;
        };
        let cosine = normal.dot(sample.direction).max(0.0);
        if cosine == 0.0 {
            continue;
        }
        let origin =
            crate::integrator::offset_origin(hit.point, hit.outward_normal, sample.direction);
        let to_sample = sample.position - origin;
        let ray = Ray::new(origin, to_sample.normalize());
        if scene.occluded(&ray, 0.0, to_sample.length().next_down()) {
            continue;
        }
        let halfway = (view + sample.direction).normalize_or_zero();
        let specular = normal.dot(halfway).max(0.0).powf(hit.material.shininess);
        color += sample.weight * (diffuse_color * cosine + hit.material.specular * specular);
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
                ..Default::default()
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
            textures: vec![],
            area_lights: vec![],
            acceleration: None,
            environment: None,
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
