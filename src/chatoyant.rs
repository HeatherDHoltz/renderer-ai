//! Anisotropic GGX surface approximation for fibrous polished stones.
use crate::pbr::{fresnel_schlick, local_direction};
use glam::Vec3;
use std::f32::consts::{PI, TAU};

fn frame(n: Vec3, fiber: Vec3) -> (Vec3, Vec3) {
    let f = fiber.normalize();
    let projected = f - n * f.dot(n);
    let tangent = if projected.length_squared() > 1e-8 {
        projected.normalize()
    } else {
        local_direction(n, Vec3::X)
    };
    (tangent, n.cross(tangent).normalize())
}
fn alpha(roughness: f32) -> f32 {
    (roughness * roughness).max(0.001)
}
fn distribution(n: Vec3, t: Vec3, b: Vec3, h: Vec3, a: f32, c: f32) -> f32 {
    if n.dot(h) <= 0.0 {
        return 0.0;
    }
    let x = h.dot(t) as f64 / a as f64;
    let y = h.dot(b) as f64 / c as f64;
    let z = h.dot(n) as f64;
    (1.0 / (std::f64::consts::PI * a as f64 * c as f64 * (x * x + y * y + z * z).powi(2))) as f32
}
fn g1(n: Vec3, t: Vec3, b: Vec3, w: Vec3, a: f32, c: f32) -> f32 {
    let nw = n.dot(w);
    if nw <= 0.0 {
        return 0.0;
    }
    let slope = (a * w.dot(t)).powi(2) + (c * w.dot(b)).powi(2);
    2.0 / (1.0 + (1.0 + slope / (nw * nw)).sqrt())
}
pub fn eval(n: Vec3, wo: Vec3, wi: Vec3, base: Vec3, fiber: Vec3, along: f32, across: f32) -> Vec3 {
    let (nv, nl) = (n.dot(wo), n.dot(wi));
    if nv <= 0.0 || nl <= 0.0 {
        return Vec3::ZERO;
    }
    let (t, b) = frame(n, fiber);
    let (a, c) = (alpha(along), alpha(across));
    let h = (wo + wi).normalize_or_zero();
    let f = fresnel_schlick(Vec3::splat(0.04), wo.dot(h));
    (Vec3::ONE - f) * base / PI
        + f * (distribution(n, t, b, h, a, c) * g1(n, t, b, wo, a, c) * g1(n, t, b, wi, a, c)
            / (4.0 * nv * nl))
}
pub fn pdf(n: Vec3, wo: Vec3, wi: Vec3, fiber: Vec3, along: f32, across: f32) -> f32 {
    if n.dot(wo) <= 0.0 || n.dot(wi) <= 0.0 {
        return 0.0;
    }
    let (t, b) = frame(n, fiber);
    let h = (wo + wi).normalize_or_zero();
    let cosine = wo.dot(h);
    if cosine <= 0.0 {
        return 0.0;
    }
    0.5 * n.dot(wi) / PI
        + 0.5 * distribution(n, t, b, h, alpha(along), alpha(across)) * n.dot(h).max(0.0)
            / (4.0 * cosine)
}
pub fn sample(
    n: Vec3,
    wo: Vec3,
    fiber: Vec3,
    along: f32,
    across: f32,
    u: [f32; 3],
) -> Option<Vec3> {
    let phi = TAU * u[1];
    let wi = if u[0] < 0.5 {
        let (t, b) = frame(n, fiber);
        let r = (u[2] / (1.0 - u[2])).sqrt();
        let h = (n + t * (alpha(along) * r * phi.cos()) + b * (alpha(across) * r * phi.sin()))
            .normalize();
        if wo.dot(h) <= 0.0 {
            return None;
        }
        crate::integrator::reflect(-wo, h).normalize()
    } else {
        let r = u[2].sqrt();
        local_direction(
            n,
            Vec3::new(r * phi.cos(), r * phi.sin(), (1.0 - u[2]).sqrt()),
        )
    };
    (n.dot(wi) > 0.0).then_some(wi)
}
