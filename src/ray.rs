use glam::Mat4;
use glam::Vec3;
use std::fmt;

pub struct Ray {
    origin: Vec3,
    direction: Vec3,
}

impl Ray {
    pub fn new(origin: Vec3, direction: Vec3) -> Self {
        Self { origin, direction }
    }
    pub fn origin(&self) -> Vec3 {
        self.origin
    }

    pub fn direction(&self) -> Vec3 {
        self.direction
    }

    pub fn point(&self, t: f32) -> Vec3 {
        self.origin + t * self.direction
    }

    pub fn transform(&self, matrix: &Mat4) -> Self {
        Self {
            origin: matrix.transform_point3(self.origin),
            direction: matrix.transform_vector3(self.direction),
        }
    }
}

impl fmt::Display for Ray {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(
            f,
            "Ray(origin: {}, direction: {})",
            self.origin, self.direction
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origin_direction_constructor() {
        let tester = Ray::new(Vec3::from([1.0, 2.0, 3.0]), Vec3::from([2.0, 0.0, 0.0]));
        assert_eq!(tester.origin(), Vec3::from([1.0, 2.0, 3.0]));
        assert_eq!(tester.direction(), Vec3::from([2.0, 0.0, 0.0]));
    }

    #[test]
    fn pointing() {
        let tester = Ray::new(Vec3::from([1.0, 2.0, 3.0]), Vec3::from([2.0, 0.0, 0.0]));
        assert_eq!(tester.point(2.0), Vec3::from([5.0, 2.0, 3.0]));
    }

    #[test]
    fn pointing_zero() {
        let tester = Ray::new(Vec3::from([1.0, 2.0, 3.0]), Vec3::from([2.0, 0.0, 0.0]));
        assert_eq!(tester.point(0.0), Vec3::from([1.0, 2.0, 3.0]));
    }

    #[test]
    fn translating() {
        let tester = Ray::new(Vec3::from([1.0, 2.0, 3.0]), Vec3::from([2.0, 0.0, 0.0]));
        let translation = Mat4::from_translation(Vec3::new(2.0, 3.0, 4.0));
        let translated = tester.transform(&translation);

        assert_eq!(translated.origin(), Vec3::from([3.0, 5.0, 7.0]));
        assert_eq!(translated.direction(), Vec3::from([2.0, 0.0, 0.0]));
    }

    #[test]
    fn scaling() {
        let tester = Ray::new(Vec3::from([1.0, 2.0, 3.0]), Vec3::from([2.0, 0.0, 0.0]));
        let scale = Mat4::from_scale(Vec3::new(2.0, 1.0, 3.0));
        let scaled = tester.transform(&scale);

        assert_eq!(scaled.origin(), Vec3::from([2.0, 2.0, 9.0]));
        assert_eq!(scaled.direction(), Vec3::from([4.0, 0.0, 0.0]));
    }

    #[test]
    fn formatting() {
        let tester = Ray::new(Vec3::from([1.0, 2.0, 3.0]), Vec3::from([2.0, 0.0, 0.0]));

        let formatted = tester.to_string();

        assert_eq!(
            formatted,
            format!(
                "Ray(origin: {}, direction: {})",
                tester.origin(),
                tester.direction()
            )
        );
    }
}
