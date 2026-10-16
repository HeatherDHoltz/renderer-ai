//! Educational Whitted recursion, kept separate from future physical shading.
use crate::{material::shade_sampled, ray::Ray, sampling::SampleKey, scene::Scene};
use glam::Vec3;

#[derive(Clone, Copy, Debug)]
pub enum Integrator {
    Whitted(Whitted),
    Physical(crate::physical::PhysicalIntegrator),
}
impl Integrator {
    pub fn trace_sampled(self, ray: &Ray, scene: &Scene, background: Vec3, key: SampleKey) -> Vec3 {
        match self {
            Self::Whitted(i) => i.trace_sampled(ray, scene, background, key),
            Self::Physical(i) => i.trace_sampled(ray, scene, background, key),
        }
    }
}

pub fn reflect(incident: Vec3, normal: Vec3) -> Vec3 {
    incident - 2.0 * incident.dot(normal) * normal
}

/// Unit incident and opposing unit interface normal. Schlick uses transmitted
/// cosine when exiting the denser medium; TIR overrides Fresnel to exactly one.
pub fn dielectric(
    incident: Vec3,
    normal: Vec3,
    incident_ior: f32,
    transmitted_ior: f32,
) -> (Option<Vec3>, f32) {
    if incident_ior == transmitted_ior {
        return (Some(incident), 0.0);
    }
    let eta = incident_ior / transmitted_ior;
    let cosine = (-incident.dot(normal)).clamp(0.0, 1.0);
    let k = 1.0 - eta * eta * (1.0 - cosine * cosine);
    // Eight f32 epsilons cover roundoff at the mathematical critical boundary.
    if k < -8.0 * f32::EPSILON {
        return (None, 1.0);
    }
    let cos_t = k.max(0.0).sqrt();
    let transmitted = (eta * incident + (eta * cosine - cos_t) * normal).normalize();
    let r0 = ((incident_ior - transmitted_ior) / (incident_ior + transmitted_ior)).powi(2);
    let schlick_cos = if eta > 1.0 { cos_t } else { cosine };
    let fresnel = r0 + (1.0 - r0) * (1.0 - schlick_cos).powi(5);
    (Some(transmitted), fresnel.clamp(0.0, 1.0))
}

/// Scale-aware geometric offset with a final representable step on each axis.
pub fn offset_origin(point: Vec3, outward: Vec3, direction: Vec3) -> Vec3 {
    let normal = if outward.dot(direction) >= 0.0 {
        outward
    } else {
        -outward
    };
    let distance = point.abs().max_element().max(1e-4) * 2e-6;
    let mut origin = point + normal * distance;
    for axis in 0..3 {
        if normal[axis] > 0.0 {
            origin[axis] = origin[axis].next_up();
        }
        if normal[axis] < 0.0 {
            origin[axis] = origin[axis].next_down();
        }
    }
    origin
}

#[derive(Clone, Copy, Debug)]
pub struct Whitted {
    max_depth: u32,
    min_throughput: f32,
}

impl Whitted {
    pub fn new(max_depth: u32, min_throughput: f32) -> Result<Self, String> {
        if max_depth > 16 || !min_throughput.is_finite() || !(0.0..=1.0).contains(&min_throughput) {
            return Err("Whitted depth must be 0..16 and throughput threshold in [0,1]".into());
        }
        Ok(Self {
            max_depth,
            min_throughput,
        })
    }
    pub fn trace(&self, ray: &Ray, scene: &Scene, background: Vec3) -> Vec3 {
        self.trace_sampled(ray, scene, background, SampleKey::default())
    }
    pub fn trace_sampled(
        &self,
        ray: &Ray,
        scene: &Scene,
        background: Vec3,
        key: SampleKey,
    ) -> Vec3 {
        self.trace_recursive(ray, scene, background, 0, Vec3::ONE, key)
    }
    fn trace_recursive(
        &self,
        ray: &Ray,
        scene: &Scene,
        background: Vec3,
        depth: u32,
        throughput: Vec3,
        key: SampleKey,
    ) -> Vec3 {
        let Some(hit) = scene.nearest_hit(ray, 0.0, f32::INFINITY) else {
            return background;
        };
        let mut color = shade_sampled(&hit, ray, scene, key);
        if depth >= self.max_depth {
            return color;
        }
        let material = hit.material;
        let d = ray.direction().normalize();
        let n = if hit.front_face {
            hit.outward_normal
        } else {
            -hit.outward_normal
        };
        let mut reflection_weight = material.reflection;
        let mut transmission_weight = Vec3::ZERO;
        let mut transmitted = None;
        if material.transmission.max_element() > 0.0 {
            let (eta_i, eta_t) = if hit.front_face {
                (1.0, material.ior)
            } else {
                (material.ior, 1.0)
            };
            let (direction, fresnel) = dielectric(d, n, eta_i, eta_t);
            reflection_weight += material.transmission * fresnel;
            if direction.is_some() {
                transmission_weight = material.transmission * (1.0 - fresnel);
            }
            transmitted = direction;
        }
        let reflected = reflect(d, n).normalize();
        if (throughput * reflection_weight).max_element() > self.min_throughput {
            let origin = offset_origin(hit.point, hit.outward_normal, reflected);
            color += reflection_weight
                * self.trace_recursive(
                    &Ray::new(origin, reflected),
                    scene,
                    background,
                    depth + 1,
                    throughput * reflection_weight,
                    key.fork(0),
                );
        }
        if let Some(direction) = transmitted
            && (throughput * transmission_weight).max_element() > self.min_throughput
        {
            let origin = offset_origin(hit.point, hit.outward_normal, direction);
            color += transmission_weight
                * self.trace_recursive(
                    &Ray::new(origin, direction),
                    scene,
                    background,
                    depth + 1,
                    throughput * transmission_weight,
                    key.fork(1),
                );
        }
        color
    }
}

impl Default for Whitted {
    fn default() -> Self {
        Self::new(8, 1e-4).expect("valid default integrator")
    }
}
