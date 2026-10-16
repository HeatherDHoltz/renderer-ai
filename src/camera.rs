use crate::ray::Ray;
use glam::Vec3;

pub struct Camera {
    position: Vec3,
    lower_left: Vec3,
    horizontal: Vec3,
    vertical: Vec3,
    forward: Vec3,
    orthographic: bool,
}

impl Camera {
    pub fn new(position: Vec3, target: Vec3, up: Vec3, aspect: f32, fov: f32) -> Self {
        Self::perspective(position, target, up, aspect, fov).expect("invalid perspective camera")
    }

    pub fn perspective(
        position: Vec3,
        target: Vec3,
        up: Vec3,
        aspect: f32,
        fov: f32,
    ) -> Result<Self, String> {
        if !fov.is_finite() || fov <= 0.0 || fov >= 179.0 {
            return Err("vertical FOV must be finite and in (0,179) degrees".into());
        }
        let height = 2.0 * (fov.to_radians() / 2.0).tan();
        Self::build(position, target, up, aspect, height, false)
    }

    pub fn orthographic(
        position: Vec3,
        target: Vec3,
        up: Vec3,
        aspect: f32,
        height: f32,
    ) -> Result<Self, String> {
        Self::build(position, target, up, aspect, height, true)
    }

    fn build(
        position: Vec3,
        target: Vec3,
        up: Vec3,
        aspect: f32,
        height: f32,
        orthographic: bool,
    ) -> Result<Self, String> {
        if !position.is_finite()
            || !target.is_finite()
            || !up.is_finite()
            || !aspect.is_finite()
            || aspect <= 0.0
            || !height.is_finite()
            || height <= 0.0
            || (position - target).length_squared() < 1e-16
            || !(position - target).length_squared().is_finite()
            || !up.length_squared().is_finite()
            || up.length_squared() < 1e-16
        {
            return Err("camera requires finite vectors, distinct eye/target, nonzero up and positive aspect/height".into());
        }
        let w = (position - target).normalize();
        if up.normalize().cross(w).length_squared() < 1e-12 {
            return Err("camera up must not be parallel to its viewing direction".into());
        }
        let u = up.cross(w).normalize();
        let v = w.cross(u);
        let horizontal = aspect * height * u;
        let vertical = height * v;
        let lower_left = position
            - if orthographic { Vec3::ZERO } else { w }
            - horizontal / 2.0
            - vertical / 2.0;
        if !lower_left.is_finite() || !horizontal.is_finite() || !vertical.is_finite() {
            return Err("camera frame exceeds supported numeric range".into());
        }
        Ok(Self {
            position,
            lower_left,
            horizontal,
            vertical,
            forward: -w,
            orthographic,
        })
    }

    pub fn ray(&self, s: f32, t: f32) -> Ray {
        let point = self.lower_left + s * self.horizontal + t * self.vertical;
        if self.orthographic {
            Ray::new(point, self.forward)
        } else {
            Ray::new(self.position, (point - self.position).normalize())
        }
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
