use glam::Vec3;
use crate::{material::Material, ray::Ray};

pub struct Hit {
    pub t: f32,
    pub point: Vec3,
    pub normal: Vec3,
    pub material: Material,
}

pub trait Shape { 
    fn hit(&self, ray: &Ray, t_min: f32, t_max: f32) -> Option<Hit>; // has to be implemented by both Sphere and Plane
}
