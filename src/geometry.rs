//! Canonical analytic primitives with shared affine instancing.
use crate::{
    material::Material,
    ray::Ray,
    shape::{Hit, Shape},
    transform::Transform,
};
use glam::{Mat4, Vec2, Vec3};
use std::f32::consts::{PI, TAU};

#[derive(Clone, Copy, Debug)]
pub enum Primitive {
    Sphere,
    Plane,
    Box,
    Cylinder,
    Cone,
}

pub struct Instance {
    pub primitive: Primitive,
    pub transform: Transform,
    pub material: Material,
}

impl Instance {
    pub fn new(primitive: Primitive, model: Mat4, material: Material) -> Result<Self, String> {
        Ok(Self {
            primitive,
            transform: Transform::new(model)?,
            material,
        })
    }
}

/// f64 arithmetic avoids cancellation in nearly tangent and near-linear equations.
fn roots(a: f64, b: f64, c: f64) -> [f32; 2] {
    if a.abs() < 1e-20 {
        return if b.abs() > 1e-20 {
            [(-c / b) as f32, f32::NAN]
        } else {
            [f32::NAN; 2]
        };
    }
    let discriminant = b * b - 4.0 * a * c;
    if discriminant < 0.0 {
        return [f32::NAN; 2];
    }
    let q = -0.5 * (b + discriminant.sqrt().copysign(b));
    if q == 0.0 {
        return [(-b / (2.0 * a)) as f32, f32::NAN];
    }
    let mut result = [(q / a) as f32, (c / q) as f32];
    result.sort_by(f32::total_cmp);
    result
}

impl Shape for Instance {
    fn hit(&self, ray: &Ray, t_min: f32, t_max: f32) -> Option<Hit> {
        if t_min.is_nan()
            || t_max.is_nan()
            || t_min > t_max
            || !ray.origin().is_finite()
            || !ray.direction().is_finite()
            || ray.direction().length_squared() == 0.0
        {
            return None;
        }
        let local = ray.transform(&self.transform.inverse());
        let o = local.origin();
        let d = local.direction();
        let mut candidate: Option<(f32, Vec3, Vec2)> = None;
        let mut push = |t: f32, n: Vec3, uv: Vec2| {
            if t.is_finite()
                && t >= t_min
                && t <= t_max
                && n.length_squared() > 0.0
                && candidate.is_none_or(|previous| t < previous.0)
            {
                candidate = Some((t, n, uv));
            }
        };
        match self.primitive {
            Primitive::Sphere => {
                let od = o.as_dvec3();
                let dd = d.as_dvec3();
                for t in roots(
                    dd.length_squared(),
                    2.0 * od.dot(dd),
                    od.length_squared() - 1.0,
                ) {
                    let p = local.point(t);
                    push(
                        t,
                        p,
                        Vec2::new(0.5 + p.z.atan2(p.x) / TAU, p.y.clamp(-1.0, 1.0).acos() / PI),
                    );
                }
            }
            Primitive::Plane => {
                if d.y != 0.0 {
                    let t = -o.y / d.y;
                    let p = local.point(t);
                    push(t, Vec3::Y, Vec2::new(p.x, p.z));
                }
            }
            Primitive::Box => {
                for axis in 0..3 {
                    if d[axis] == 0.0 {
                        continue;
                    }
                    for side in [-1.0, 1.0] {
                        let t = (side - o[axis]) / d[axis];
                        let p = local.point(t);
                        let a = (axis + 1) % 3;
                        let b = (axis + 2) % 3;
                        if p[a].abs() <= 1.0 + 1e-6 && p[b].abs() <= 1.0 + 1e-6 {
                            let mut n = Vec3::ZERO;
                            n[axis] = side;
                            push(t, n, Vec2::new(p[a], p[b]) * 0.5 + Vec2::splat(0.5));
                        }
                    }
                }
            }
            Primitive::Cylinder | Primitive::Cone => {
                let cone = matches!(self.primitive, Primitive::Cone);
                let (ox, oy, oz) = (o.x as f64, o.y as f64, o.z as f64);
                let (dx, dy, dz) = (d.x as f64, d.y as f64, d.z as f64);
                let k = if cone { 0.25 } else { 0.0 };
                let a = dx * dx + dz * dz - k * dy * dy;
                let b = 2.0 * (ox * dx + oz * dz + k * (1.0 - oy) * dy);
                let c = ox * ox + oz * oz - if cone { k * (1.0 - oy).powi(2) } else { 1.0 };
                for t in roots(a, b, c) {
                    let p = local.point(t);
                    if p.y >= -1.0 && p.y <= 1.0 {
                        let n = Vec3::new(p.x, if cone { 0.25 * (1.0 - p.y) } else { 0.0 }, p.z);
                        // The cone apex has no unique normal; choose the limiting axial normal.
                        let n = if n.length_squared() == 0.0 {
                            Vec3::Y
                        } else {
                            n
                        };
                        push(
                            t,
                            n,
                            Vec2::new(0.5 + p.z.atan2(p.x) / TAU, 0.5 * (1.0 - p.y)),
                        );
                    }
                }
                if d.y != 0.0 {
                    for y in [-1.0, 1.0] {
                        if cone && y == 1.0 {
                            continue;
                        }
                        let t = (y - o.y) / d.y;
                        let p = local.point(t);
                        if p.x * p.x + p.z * p.z <= 1.0 + 1e-6 {
                            push(t, Vec3::Y * y, Vec2::new(p.x, p.z) * 0.5 + Vec2::splat(0.5));
                        }
                    }
                }
            }
        }
        let (t, n, uv) = candidate?;
        Some(Hit::new(
            ray,
            t,
            self.transform.normal(n),
            self.material,
            uv,
        ))
    }
}
