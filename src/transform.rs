//! Validated affine transforms. Cached inverse/normal matrices cannot become stale.
use glam::{Mat3, Mat4, Vec3};

#[derive(Clone, Copy, Debug)]
pub struct Transform {
    model: Mat4,
    inverse: Mat4,
    normal: Mat3,
}

impl Transform {
    pub fn new(model: Mat4) -> Result<Self, String> {
        if !model.is_finite()
            || model.x_axis.w != 0.0
            || model.y_axis.w != 0.0
            || model.z_axis.w != 0.0
            || model.w_axis.w != 1.0
        {
            return Err("transform must be a finite affine matrix".into());
        }
        let linear = Mat3::from_mat4(model);
        let lengths = Vec3::new(
            linear.x_axis.length(),
            linear.y_axis.length(),
            linear.z_axis.length(),
        );
        if lengths.min_element() < 1e-8
            || lengths.max_element() > 1e8
            || (linear.determinant() / lengths.element_product()).abs() < 1e-7
        {
            return Err(
                "transform is singular, ill-conditioned, or outside supported scale 1e-8..1e8"
                    .into(),
            );
        }
        let inverse = model.inverse();
        if !inverse.is_finite() {
            return Err("transform inverse is nonfinite".into());
        }
        Ok(Self {
            model,
            inverse,
            normal: Mat3::from_mat4(inverse).transpose(),
        })
    }
    pub fn model(self) -> Mat4 {
        self.model
    }
    pub fn inverse(self) -> Mat4 {
        self.inverse
    }
    pub fn normal(self, n: Vec3) -> Vec3 {
        (self.normal * n).normalize()
    }
}

impl Default for Transform {
    fn default() -> Self {
        Self::new(Mat4::IDENTITY).expect("identity is invertible")
    }
}
