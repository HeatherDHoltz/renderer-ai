use crate::{
    ray::Ray,
    shape::{Hit, Shape},
};
use glam::Vec3;

pub struct PointLight {
    pub position: Vec3,
    pub color: Vec3,
}

pub struct Scene {
    pub shapes: Vec<Box<dyn Shape>>,
    pub lights: Vec<PointLight>,
}

impl Scene {
    pub fn nearest_hit(&self, ray: &Ray, t_min: f32, t_max: f32) -> Option<Hit> {
        let mut closest_t = t_max;
        let mut closest_hit = None;
        for (object_id, shape) in self.shapes.iter().enumerate() {
            if let Some(mut hit) = shape.hit(ray, t_min, closest_t)
                && (closest_hit.is_none() || hit.t < closest_t)
            {
                closest_t = hit.t;
                hit.object_id = object_id;
                closest_hit = Some(hit);
            }
        }
        closest_hit
    }

    pub fn occluded(&self, ray: &Ray, t_min: f32, t_max: f32) -> bool {
        self.shapes
            .iter()
            .any(|shape| shape.hit(ray, t_min, t_max).is_some())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{material::Material, plane::Plane, sphere::Sphere};
    use glam::Vec3;

    fn material(color: Vec3) -> Material {
        Material {
            diffuse: color,
            specular: Vec3::ZERO,
            shininess: 32.0,
        }
    }

    #[test]
    fn empty_scene() {
        let scene = Scene {
            lights: vec![],
            shapes: vec![],
        };
        let ray = Ray::new(Vec3::ZERO, -Vec3::Z);
        assert!(scene.nearest_hit(&ray, 0.001, 100.0).is_none());
    }

    #[test]
    fn all_shapes_missed() {
        let scene = Scene {
            lights: vec![],
            shapes: vec![
                Box::new(Sphere::new(
                    Vec3::new(5.0, 0.0, 0.0),
                    1.0,
                    material(Vec3::X),
                )),
                Box::new(Plane::new(-Vec3::Y, Vec3::Y, material(Vec3::Y))),
            ],
        };
        let ray = Ray::new(Vec3::new(0.0, 0.0, 5.0), -Vec3::Z);
        assert!(scene.nearest_hit(&ray, 0.001, 100.0).is_none());
    }

    #[test]
    fn nearest_sphere_in_either_order() {
        let mut scene = Scene {
            lights: vec![],
            shapes: vec![
                Box::new(Sphere::new(Vec3::ZERO, 1.0, material(Vec3::X))),
                Box::new(Sphere::new(2.0 * Vec3::Z, 1.0, material(Vec3::Y))),
            ],
        };
        let ray = Ray::new(5.0 * Vec3::Z, -Vec3::Z);
        for _ in 0..2 {
            let hit = scene.nearest_hit(&ray, 0.001, 100.0).unwrap();
            assert_eq!(hit.t, 2.0);
            assert_eq!(hit.point, 3.0 * Vec3::Z);
            assert_eq!(hit.normal, Vec3::Z);
            assert_eq!(hit.material.diffuse, Vec3::Y);
            scene.shapes.reverse();
        }
    }

    #[test]
    fn sphere_and_plane() {
        let scene = Scene {
            lights: vec![],
            shapes: vec![
                Box::new(Plane::new(Vec3::ZERO, Vec3::Y, material(Vec3::Y))),
                Box::new(Sphere::new(2.0 * Vec3::Y, 1.0, material(Vec3::X))),
            ],
        };
        let above_sphere = Ray::new(5.0 * Vec3::Y, -Vec3::Y);
        let hit = scene.nearest_hit(&above_sphere, 0.001, 100.0).unwrap();
        assert_eq!(hit.t, 2.0);
        assert_eq!(hit.material.diffuse, Vec3::X);
        let beside_sphere = Ray::new(Vec3::new(3.0, 5.0, 0.0), -Vec3::Y);
        let hit = scene.nearest_hit(&beside_sphere, 0.001, 100.0).unwrap();
        assert_eq!(hit.t, 5.0);
        assert_eq!(hit.point, Vec3::new(3.0, 0.0, 0.0));
        assert_eq!(hit.material.diffuse, Vec3::Y);
    }

    #[test]
    fn respects_hit_range() {
        let scene = Scene {
            lights: vec![],
            shapes: vec![
                Box::new(Plane::new(3.0 * Vec3::Y, Vec3::Y, material(Vec3::X))),
                Box::new(Plane::new(Vec3::ZERO, Vec3::Y, material(Vec3::Y))),
            ],
        };
        let ray = Ray::new(5.0 * Vec3::Y, -Vec3::Y);
        assert!(scene.nearest_hit(&ray, 0.001, 1.0).is_none());
        assert!(scene.nearest_hit(&ray, 6.0, 10.0).is_none());
        let hit = scene.nearest_hit(&ray, 3.0, 10.0).unwrap();
        assert_eq!(hit.t, 5.0);
        assert_eq!(hit.material.diffuse, Vec3::Y);
        assert_eq!(scene.nearest_hit(&ray, 2.0, 2.0).unwrap().t, 2.0);
    }
}
