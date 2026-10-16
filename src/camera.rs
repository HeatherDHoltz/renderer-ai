use glam::Vec3;
use crate::ray::Ray;

pub struct Camera {
    position: Vec3,
    lower_left: Vec3,
    horizontal: Vec3,
    vertical: Vec3,
}

impl Camera {
    pub fn new(position: Vec3, target: Vec3, up: Vec3, aspect: f32, fov: f32) -> Self {
        let w = (position - target).normalize();
        let u = up.cross(w).normalize();
        let v = w.cross(u);
        let height = 2.0 * (fov.to_radians() / 2.0).tan();
        let horizontal = aspect * height * u;
        let vertical = height * v;
        let lower_left = position - w - horizontal / 2.0 - vertical / 2.0;
        Self { position, lower_left, horizontal, vertical }
    }

    pub fn ray(&self, s: f32, t: f32) -> Ray {
        let point = self.lower_left + s * self.horizontal + t * self.vertical;
        Ray::new(self.position, (point - self.position).normalize())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn corner_rays() {
        let camera = Camera::new(Vec3::ZERO, -Vec3::Z, Vec3::Y, 2.0, 90.0);
        for (s, t, direction) in [
            (0.5, 0.5, Vec3::new(0.0, 0.0, -1.0)),
            (0.0, 0.0, Vec3::new(-2.0, -1.0, -1.0)),
            (1.0, 0.0, Vec3::new(2.0, -1.0, -1.0)),
            (0.0, 1.0, Vec3::new(-2.0, 1.0, -1.0)),
            (1.0, 1.0, Vec3::new(2.0, 1.0, -1.0)),
        ] {
            assert!((camera.ray(s, t).direction() - direction.normalize()).length() < 0.0001);
        }
    }

    #[test]
    fn rotated_camera() {
        let camera = Camera::new(Vec3::new(5.0, 0.0, 0.0), Vec3::ZERO, Vec3::Y, 2.0, 90.0);
        assert_eq!(camera.ray(0.5, 0.5).origin(), Vec3::new(5.0, 0.0, 0.0));
        assert!((camera.ray(0.5, 0.5).direction() + Vec3::X).length() < 0.0001);
    }
}
