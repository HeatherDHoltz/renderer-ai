//! Defined single-scatter Lambert/GGX physical material model and sampling.
use glam::Vec3;
use serde::{Deserialize, Serialize};
use std::f32::consts::{PI, TAU};

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(tag = "model", rename_all = "snake_case", deny_unknown_fields)]
pub enum PhysicalMaterial {
    Diffuse {
        base_color: [f32; 3],
    },
    MetalRough {
        base_color: [f32; 3],
        metallic: f32,
        roughness: f32,
    },
    Dielectric {
        tint: [f32; 3],
        ior: f32,
    },
}
pub struct BrdfSample {
    pub direction: Vec3,
    pub value: Vec3,
    pub pdf: f32,
}
pub fn fresnel_schlick(f0: Vec3, cosine: f32) -> Vec3 {
    f0 + (Vec3::ONE - f0) * (1.0 - cosine.clamp(0.0, 1.0)).powi(5)
}
pub fn ggx_distribution(no_h: f32, alpha: f32) -> f32 {
    if no_h <= 0.0 {
        return 0.0;
    }
    // This form retains alpha² near h=n instead of subtracting almost equal floats.
    let nh = no_h as f64;
    let a = alpha as f64;
    let denominator = (1.0 - nh * nh) + nh * nh * a * a;
    (a * a / (std::f64::consts::PI * denominator * denominator)) as f32
}
pub fn smith_g1(cosine: f32, alpha: f32) -> f32 {
    if cosine <= 0.0 {
        0.0
    } else {
        2.0 * cosine / (cosine + (alpha * alpha + (1.0 - alpha * alpha) * cosine * cosine).sqrt())
    }
}
pub fn local_direction(n: Vec3, local: Vec3) -> Vec3 {
    let tangent = if n.y.abs() < 0.999 {
        Vec3::Y.cross(n).normalize()
    } else {
        Vec3::X.cross(n).normalize()
    };
    let bitangent = n.cross(tangent);
    (tangent * local.x + bitangent * local.y + n * local.z).normalize()
}

impl PhysicalMaterial {
    pub fn validate(self) -> Result<(), String> {
        let color = match self {
            Self::Diffuse { base_color } | Self::MetalRough { base_color, .. } => base_color,
            Self::Dielectric { tint, .. } => tint,
        };
        let color = Vec3::from_array(color);
        if !color.is_finite() || color.min_element() < 0.0 || color.max_element() > 1.0 {
            return Err("physical base color/tint must be finite RGB in [0,1]".into());
        }
        match self {
            Self::MetalRough {
                metallic,
                roughness,
                ..
            } => {
                if !metallic.is_finite()
                    || !(0.0..=1.0).contains(&metallic)
                    || !roughness.is_finite()
                    || !(0.0..=1.0).contains(&roughness)
                {
                    return Err("metallic/roughness must be in [0,1]".into());
                }
            }
            Self::Dielectric { ior, .. } if !ior.is_finite() || !(1.0..=4.0).contains(&ior) => {
                return Err("dielectric IOR must be in [1,4]".into());
            }
            _ => {}
        }
        Ok(())
    }
    pub fn textured(self, texture: Vec3) -> Self {
        match self {
            Self::Diffuse { base_color } => Self::Diffuse {
                base_color: (Vec3::from_array(base_color) * texture).to_array(),
            },
            Self::MetalRough {
                base_color,
                metallic,
                roughness,
            } => Self::MetalRough {
                base_color: (Vec3::from_array(base_color) * texture).to_array(),
                metallic,
                roughness,
            },
            Self::Dielectric { tint, ior } => Self::Dielectric {
                tint: (Vec3::from_array(tint) * texture).to_array(),
                ior,
            },
        }
    }
    fn parameters(self) -> (Vec3, f32, f32, f32) {
        match self {
            Self::MetalRough {
                base_color,
                metallic,
                roughness,
            } => (
                base_color.into(),
                metallic,
                (roughness * roughness).max(0.001),
                0.5 + 0.5 * metallic,
            ),
            _ => unreachable!("only rough reflection uses microfacet parameters"),
        }
    }
    pub fn eval(self, n: Vec3, wo: Vec3, wi: Vec3) -> Vec3 {
        let nv = n.dot(wo);
        let nl = n.dot(wi);
        if nv <= 0.0 || nl <= 0.0 {
            return Vec3::ZERO;
        }
        match self {
            Self::Diffuse { base_color } => Vec3::from_array(base_color) / PI,
            Self::Dielectric { .. } => Vec3::ZERO,
            Self::MetalRough { .. } => {
                let (base, metallic, alpha, _) = self.parameters();
                let h = (wo + wi).normalize_or_zero();
                let nh = n.dot(h).clamp(0.0, 1.0);
                let vh = wo.dot(h).clamp(0.0, 1.0);
                let f = fresnel_schlick(Vec3::splat(0.04).lerp(base, metallic), vh);
                let specular = f
                    * (ggx_distribution(nh, alpha) * smith_g1(nv, alpha) * smith_g1(nl, alpha)
                        / (4.0 * nv * nl));
                let diffuse = (Vec3::ONE - f) * base * ((1.0 - metallic) / PI);
                diffuse + specular
            }
        }
    }
    pub fn pdf(self, n: Vec3, wo: Vec3, wi: Vec3) -> f32 {
        let nl = n.dot(wi).max(0.0);
        if n.dot(wo) <= 0.0 || nl <= 0.0 {
            return 0.0;
        }
        match self {
            Self::Diffuse { .. } => nl / PI,
            Self::Dielectric { .. } => 0.0,
            Self::MetalRough { .. } => {
                let (_, _, alpha, q) = self.parameters();
                let h = (wi + wo).normalize_or_zero();
                let nh = n.dot(h).max(0.0);
                let vh = wo.dot(h).max(0.0);
                let spec = if vh > 0.0 {
                    ggx_distribution(nh, alpha) * nh / (4.0 * vh)
                } else {
                    0.0
                };
                (1.0 - q) * nl / PI + q * spec
            }
        }
    }
    pub fn sample(self, n: Vec3, wo: Vec3, u: [f32; 3]) -> Option<BrdfSample> {
        if matches!(self, Self::Dielectric { .. }) || n.dot(wo) <= 0.0 {
            return None;
        }
        let (alpha, q) = if matches!(self, Self::MetalRough { .. }) {
            let (_, _, a, q) = self.parameters();
            (a, q)
        } else {
            (1.0, 0.0)
        };
        let phi = TAU * u[1];
        let direction = if u[0] < q {
            let cosine = ((1.0 - u[2]) / (1.0 + (alpha * alpha - 1.0) * u[2]))
                .max(0.0)
                .sqrt();
            let sine = (1.0 - cosine * cosine).max(0.0).sqrt();
            let h = local_direction(n, Vec3::new(sine * phi.cos(), sine * phi.sin(), cosine));
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
        let pdf = self.pdf(n, wo, direction);
        if pdf <= 0.0 || !pdf.is_finite() {
            return None;
        }
        Some(BrdfSample {
            direction,
            value: self.eval(n, wo, direction),
            pdf,
        })
    }
}

/// Exact unpolarized dielectric Fresnel and radiance-throughput scale.
pub fn dielectric_interface(d: Vec3, n: Vec3, eta_i: f32, eta_t: f32) -> (Option<Vec3>, f32, f32) {
    let eta = eta_i as f64 / eta_t as f64;
    let ci = (-d.dot(n)).clamp(0.0, 1.0) as f64;
    let k = 1.0 - eta * eta * (1.0 - ci * ci);
    if k < -8.0 * f32::EPSILON as f64 {
        return (None, 1.0, (eta * eta) as f32);
    }
    let ct = k.max(0.0).sqrt();
    let direction = ((eta as f32) * d + ((eta * ci - ct) as f32) * n).normalize();
    if eta_i == eta_t {
        return (Some(direction), 0.0, 1.0);
    }
    let ei = eta_i as f64;
    let et = eta_t as f64;
    let rs = (ei * ci - et * ct) / (ei * ci + et * ct);
    let rp = (et * ci - ei * ct) / (et * ci + ei * ct);
    (
        Some(direction),
        (0.5 * (rs * rs + rp * rp)).clamp(0.0, 1.0) as f32,
        (eta * eta) as f32,
    )
}
