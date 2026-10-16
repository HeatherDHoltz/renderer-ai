use glam::{Vec2, Vec3};

/// Uniform-area rectangle. edge_u/edge_v are full spanning vectors around center.
pub struct RectLight {
    center: Vec3,
    edge_u: Vec3,
    edge_v: Vec3,
    pub radiance: Vec3,
    pub two_sided: bool,
    normal: Vec3,
    area: f32,
}
pub struct LightSample {
    pub position: Vec3,
    pub direction: Vec3,
    pub distance: f32,
    pub weight: Vec3,
    pub pdf_solid_angle: f32,
}

impl RectLight {
    pub fn new(
        center: Vec3,
        edge_u: Vec3,
        edge_v: Vec3,
        radiance: Vec3,
        two_sided: bool,
    ) -> Result<Self, String> {
        let cross = edge_u.cross(edge_v);
        let area = cross.length();
        if !center.is_finite()
            || !edge_u.is_finite()
            || !edge_v.is_finite()
            || !radiance.is_finite()
            || radiance.min_element() < 0.0
            || !area.is_finite()
            || area < 1e-12
        {
            return Err("rectangle needs finite center/edges/radiance, nonnegative radiance, and nonparallel nonzero edges".into());
        }
        Ok(Self {
            center,
            edge_u,
            edge_v,
            radiance,
            two_sided,
            normal: cross / area,
            area,
        })
    }
    pub fn area(&self) -> f32 {
        self.area
    }
    pub fn sample(&self, point: Vec3, uv: Vec2) -> Option<LightSample> {
        let position = self.center + (uv.x - 0.5) * self.edge_u + (uv.y - 0.5) * self.edge_v;
        let to_light = position - point;
        let distance_squared = to_light.length_squared();
        if distance_squared <= 1e-16 || !distance_squared.is_finite() {
            return None;
        }
        let distance = distance_squared.sqrt();
        let direction = to_light / distance;
        let cosine = self.normal.dot(-direction);
        let cosine = if self.two_sided {
            cosine.abs()
        } else {
            cosine.max(0.0)
        };
        if cosine <= 0.0 {
            return None;
        }
        let inverse_pdf = cosine * self.area / distance_squared;
        Some(LightSample {
            position,
            direction,
            distance,
            weight: self.radiance * inverse_pdf,
            pdf_solid_angle: 1.0 / inverse_pdf,
        })
    }
}
