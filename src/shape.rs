use crate::{material::Material, ray::Ray};
use glam::{Vec2, Vec3};

pub struct Hit {
    pub t: f32,
    pub point: Vec3,
    pub normal: Vec3,
    pub outward_normal: Vec3,
    pub front_face: bool,
    pub uv: Vec2,
    pub barycentrics: Option<Vec3>,
    pub object_id: usize,
    pub primitive_id: usize,
    pub material: Material,
}

impl Hit {
    pub fn new(ray: &Ray, t: f32, outward_normal: Vec3, material: Material, uv: Vec2) -> Self {
        let front_face = ray.direction().dot(outward_normal) <= 0.0;
        Self {
            t,
            point: ray.point(t),
            normal: if front_face {
                outward_normal
            } else {
                -outward_normal
            },
            outward_normal,
            front_face,
            uv,
            barycentrics: None,
            object_id: 0,
            primitive_id: 0,
            material,
        }
    }
}

pub trait Shape: Send + Sync {
    fn hit(&self, ray: &Ray, t_min: f32, t_max: f32) -> Option<Hit>;
    fn bounds(&self) -> Option<crate::accel::Aabb> {
        None
    }
    fn triangle_count(&self) -> usize {
        0
    }
    fn primitive_count(&self) -> usize {
        1
    }
    fn hit_with_stats(
        &self,
        ray: &Ray,
        t_min: f32,
        t_max: f32,
        stats: &mut crate::accel::TraceStats,
    ) -> Option<Hit> {
        stats.primitive_tests += 1;
        self.hit(ray, t_min, t_max)
    }
    fn occluded(&self, ray: &Ray, t_min: f32, t_max: f32) -> bool {
        self.hit(ray, t_min, t_max).is_some()
    }
    fn occluded_with_stats(
        &self,
        ray: &Ray,
        t_min: f32,
        t_max: f32,
        stats: &mut crate::accel::TraceStats,
    ) -> bool {
        self.hit_with_stats(ray, t_min, t_max, stats).is_some()
    }
}
