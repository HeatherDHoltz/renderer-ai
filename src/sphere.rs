use crate::material::Material;
use crate::ray::Ray;
use crate::shape::{Hit, Shape};
use glam::{Mat4, Vec3};

pub struct Sphere {
    pub transform: Mat4,
    pub material: Material,
}

impl Sphere {
    pub fn new(position: Vec3, radius: f32, material: Material) -> Self {
        assert!(radius.is_finite() && radius > 0.0);
        let scale = Mat4::from_scale(Vec3::splat(radius));
        let translation = Mat4::from_translation(position);
        let transform = translation * scale;
        Self {
            transform,
            material,
        }
    }
}

impl Shape for Sphere {
    fn hit(&self, ray: &Ray, t_min: f32, t_max: f32) -> Option<Hit> {
        let center = self.transform.transform_point3(Vec3::ZERO);
        let radius = self.transform.transform_vector3(Vec3::X).length();

        // quadratic equation in class
        let offset = ray.origin() - center;
        let a = ray.direction().length_squared();
        let b = 2.0 * offset.dot(ray.direction());
        let c = offset.length_squared() - radius * radius;
        let discriminant = b * b - 4.0 * a * c;
        if discriminant < 0.0 {
            return None;
        }
        let root = discriminant.sqrt();
        let near = (-b - root) / (2.0 * a);
        let far = (-b + root) / (2.0 * a);

        if t_max >= near && near >= t_min {
            let mut normal = (ray.point(near) - center).normalize();
            if normal.dot(ray.direction()) > 0.0 {
                // camera inside sphere
                normal = -normal;
            }
            Some(Hit {
                t: near,
                point: ray.point(near),
                normal,
                material: self.material,
            })
        } else if t_max >= far && far >= t_min {
            let mut normal = (ray.point(far) - center).normalize();
            if normal.dot(ray.direction()) > 0.0 {
                // camera inside sphere
                normal = -normal;
            }
            Some(Hit {
                t: far,
                point: ray.point(far),
                normal,
                material: self.material,
            })
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn material() -> Material {
        Material {
            diffuse: Vec3::X,
            specular: Vec3::ONE,
            shininess: 32.0,
        }
    }

    #[test]
    fn nearest_intersection() {
        let sphere = Sphere::new(Vec3::ZERO, 1.0, material());
        let ray = Ray::new(Vec3::new(0.0, 0.0, 3.0), Vec3::new(0.0, 0.0, -2.0));
        let hit = sphere.hit(&ray, 0.001, f32::INFINITY).unwrap();
        assert_eq!(hit.t, 1.0);
        assert_eq!(hit.point, Vec3::Z);
        assert_eq!(hit.normal, Vec3::Z);
        assert_eq!(hit.material.diffuse, Vec3::X);
        assert_eq!(hit.material.specular, Vec3::ONE);
        assert_eq!(hit.material.shininess, 32.0);
    }

    #[test]
    fn ray_inside_sphere() {
        let sphere = Sphere::new(Vec3::ZERO, 1.0, material());
        let hit = sphere
            .hit(&Ray::new(Vec3::ZERO, Vec3::X), 0.001, 10.0)
            .unwrap();
        assert_eq!(hit.t, 1.0);
        assert_eq!(hit.point, Vec3::X);
        assert_eq!(hit.normal, -Vec3::X);
    }

    #[test]
    fn sphere_behind_ray() {
        let sphere = Sphere::new(Vec3::ZERO, 1.0, material());
        let ray = Ray::new(Vec3::new(0.0, 0.0, 3.0), Vec3::Z);
        assert!(sphere.hit(&ray, 0.001, 10.0).is_none());
    }

    #[test]
    fn ray_misses_sphere() {
        let sphere = Sphere::new(Vec3::ZERO, 1.0, material());
        let ray = Ray::new(Vec3::new(2.0, 0.0, 3.0), -Vec3::Z);
        assert!(sphere.hit(&ray, 0.001, 10.0).is_none());
    }

    #[test]
    fn tangent_ray() {
        let sphere = Sphere::new(Vec3::ZERO, 1.0, material());
        let ray = Ray::new(Vec3::new(1.0, 0.0, 3.0), -Vec3::Z);
        let hit = sphere.hit(&ray, 0.001, 10.0).unwrap();
        assert_eq!(hit.t, 3.0);
        assert_eq!(hit.point, Vec3::X);
        assert_eq!(hit.normal, Vec3::X);
    }

    #[test]
    fn translated_and_scaled_sphere() {
        let sphere = Sphere::new(Vec3::new(3.0, 2.0, -4.0), 2.0, material());
        let ray = Ray::new(Vec3::new(3.0, 2.0, 1.0), -Vec3::Z);
        let hit = sphere.hit(&ray, 0.001, 10.0).unwrap();
        assert_eq!(hit.t, 3.0);
        assert_eq!(hit.point, Vec3::new(3.0, 2.0, -2.0));
        assert_eq!(hit.normal, Vec3::Z);
    }

    #[test]
    fn hit_range() {
        let sphere = Sphere::new(Vec3::ZERO, 1.0, material());
        let ray = Ray::new(Vec3::new(0.0, 0.0, 3.0), -Vec3::Z);
        assert!(sphere.hit(&ray, 0.001, 1.0).is_none());
        assert!(sphere.hit(&ray, 5.0, 10.0).is_none());
        assert_eq!(sphere.hit(&ray, 3.0, 5.0).unwrap().t, 4.0);
        assert_eq!(sphere.hit(&ray, 2.0, 2.0).unwrap().t, 2.0);
        assert_eq!(sphere.hit(&ray, 4.0, 4.0).unwrap().t, 4.0);
    }

    #[test]
    #[should_panic]
    fn zero_radius_rejected() {
        Sphere::new(Vec3::ZERO, 0.0, material());
    }
}
