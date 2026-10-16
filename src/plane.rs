use crate::{
    geometry::{Instance, Primitive},
    material::Material,
    ray::Ray,
    shape::{Hit, Shape},
};
use glam::{Mat4, Quat, Vec3};

pub struct Plane {
    instance: Instance,
}
impl Plane {
    pub fn new(position: Vec3, normal: Vec3, material: Material) -> Self {
        assert!(normal.is_finite() && normal.length_squared() > 0.0);
        let model = Mat4::from_translation(position)
            * Mat4::from_quat(Quat::from_rotation_arc(Vec3::Y, normal.normalize()));
        Self::from_transform(model, material).expect("valid plane transform")
    }
    pub fn from_transform(model: Mat4, material: Material) -> Result<Self, String> {
        Ok(Self {
            instance: Instance::new(Primitive::Plane, model, material)?,
        })
    }
}
impl Shape for Plane {
    fn hit(&self, ray: &Ray, t_min: f32, t_max: f32) -> Option<Hit> {
        self.instance.hit(ray, t_min, t_max)
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
    fn ray_hits_plane() {
        let plane = Plane::new(Vec3::ZERO, Vec3::Y, material());
        let ray = Ray::new(Vec3::new(2.0, 4.0, 3.0), -2.0 * Vec3::Y);
        let hit = plane.hit(&ray, 0.001, 10.0).unwrap();
        assert_eq!(hit.t, 2.0);
        assert_eq!(hit.point, Vec3::new(2.0, 0.0, 3.0));
        assert_eq!(hit.normal, Vec3::Y);
        assert_eq!(hit.material.diffuse, Vec3::X);
        assert_eq!(hit.material.specular, Vec3::ONE);
        assert_eq!(hit.material.shininess, 32.0);
    }

    #[test]
    fn ray_hits_back_of_plane() {
        let plane = Plane::new(Vec3::ZERO, Vec3::Y, material());
        let ray = Ray::new(-2.0 * Vec3::Y, Vec3::Y);
        let hit = plane.hit(&ray, 0.001, 10.0).unwrap();
        assert_eq!(hit.t, 2.0);
        assert_eq!(hit.point, Vec3::ZERO);
        assert_eq!(hit.normal, -Vec3::Y);
    }

    #[test]
    fn parallel_ray() {
        let plane = Plane::new(Vec3::ZERO, Vec3::Y, material());
        let ray = Ray::new(Vec3::Y, Vec3::X);
        assert!(plane.hit(&ray, 0.001, 10.0).is_none());
        let ray_on_plane = Ray::new(Vec3::ZERO, Vec3::X);
        assert!(plane.hit(&ray_on_plane, 0.001, 10.0).is_none());
    }

    #[test]
    fn plane_behind_ray() {
        let plane = Plane::new(Vec3::ZERO, Vec3::Y, material());
        let ray = Ray::new(Vec3::Y, Vec3::Y);
        assert!(plane.hit(&ray, 0.001, 10.0).is_none());
    }

    #[test]
    fn translated_and_rotated_plane() {
        let plane = Plane::new(Vec3::new(3.0, 0.0, 0.0), 2.0 * Vec3::X, material());
        let ray = Ray::new(Vec3::new(7.0, 2.0, 1.0), -Vec3::X);
        let hit = plane.hit(&ray, 0.001, 10.0).unwrap();
        assert!((hit.t - 4.0).abs() < 0.0001);
        assert!((hit.point - Vec3::new(3.0, 2.0, 1.0)).length() < 0.0001);
        assert!((hit.normal - Vec3::X).length() < 0.0001);
    }

    #[test]
    fn downward_normal() {
        let plane = Plane::new(Vec3::ZERO, -Vec3::Y, material());
        let ray = Ray::new(-2.0 * Vec3::Y, Vec3::Y);
        let hit = plane.hit(&ray, 0.001, 10.0).unwrap();
        assert!((hit.t - 2.0).abs() < 0.0001);
        assert!(hit.point.length() < 0.0001);
        assert!((hit.normal + Vec3::Y).length() < 0.0001);
    }

    #[test]
    fn hit_range() {
        let plane = Plane::new(Vec3::ZERO, Vec3::Y, material());
        let ray = Ray::new(2.0 * Vec3::Y, -Vec3::Y);
        assert!(plane.hit(&ray, 0.001, 1.0).is_none());
        assert!(plane.hit(&ray, 3.0, 10.0).is_none());
        assert_eq!(plane.hit(&ray, 2.0, 2.0).unwrap().t, 2.0);
    }

    #[test]
    #[should_panic]
    fn zero_normal_rejected() {
        Plane::new(Vec3::ZERO, Vec3::ZERO, material());
    }
}
