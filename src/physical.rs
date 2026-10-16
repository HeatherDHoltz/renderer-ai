//! Direct physical lighting + ideal dielectric recursion; no diffuse interreflection.
use crate::{
    integrator::{offset_origin, reflect},
    pbr::{PhysicalMaterial, beer_transmittance, dielectric_interface},
    ray::Ray,
    sampling::SampleKey,
    scene::Scene,
    shape::Hit,
};
use glam::Vec3;

#[derive(Clone, Copy, Debug)]
pub struct PhysicalIntegrator {
    max_depth: u32,
    min_throughput: f32,
}
#[derive(Clone, Copy)]
struct Medium {
    object_id: usize,
    absorption: Vec3,
}
#[derive(Clone, Copy)]
struct PathState {
    depth: u32,
    throughput: Vec3,
    key: SampleKey,
    medium: Option<Medium>,
    boundary: Option<(usize, bool)>, // Last solid and expected inside/outside side.
}
impl PhysicalIntegrator {
    pub fn new(max_depth: u32, min_throughput: f32) -> Result<Self, String> {
        crate::integrator::Whitted::new(max_depth, min_throughput)?;
        Ok(Self {
            max_depth,
            min_throughput,
        })
    }
    pub fn trace_sampled(
        &self,
        ray: &Ray,
        scene: &Scene,
        background: Vec3,
        key: SampleKey,
    ) -> Vec3 {
        self.trace_recursive(
            ray,
            scene,
            background,
            PathState {
                depth: 0,
                throughput: Vec3::ONE,
                key,
                medium: None,
                boundary: None,
            },
        )
    }
    fn trace_recursive(
        &self,
        ray: &Ray,
        scene: &Scene,
        background: Vec3,
        state: PathState,
    ) -> Vec3 {
        let PathState {
            depth,
            mut throughput,
            key,
            ..
        } = state;
        let hit = match transport_hit(scene, ray, state.boundary) {
            Ok(hit) => hit,
            Err(()) => return Vec3::splat(f32::NAN),
        };
        let Some(hit) = hit else {
            let attenuation = state.medium.map_or(Vec3::ONE, |m| {
                beer_transmittance(m.absorption, f32::INFINITY)
            });
            return attenuation
                * scene
                    .environment
                    .as_ref()
                    .map_or(background, |env| env.eval(ray.direction()));
        };
        let Some(material) = hit.material.physical else {
            return Vec3::splat(f32::NAN);
        };
        let texture = hit
            .material
            .texture
            .map_or(Vec3::ONE, |id| scene.textures[id].sample(hit.uv));
        let material = material.textured(texture);
        // An initial inside ray can infer its medium at a back-facing boundary.
        let incident = state.medium.or_else(|| match material {
            PhysicalMaterial::Gemstone { absorption, .. } if !hit.front_face => Some(Medium {
                object_id: hit.object_id,
                absorption: absorption.into(),
            }),
            _ => None,
        });
        if incident.is_some_and(|m| m.object_id != hit.object_id || hit.front_face) {
            // Nested/intersecting refractive solids require a medium stack, which is unsupported.
            return Vec3::splat(f32::NAN);
        }
        let attenuation = incident.map_or(Vec3::ONE, |m| {
            beer_transmittance(m.absorption, hit.t * ray.direction().length())
        });
        throughput *= attenuation;
        let interface = match material {
            PhysicalMaterial::Dielectric { tint, ior } => Some((Vec3::from_array(tint), ior, None)),
            PhysicalMaterial::Gemstone { absorption, ior } => {
                Some((Vec3::ONE, ior, Some(Vec3::from_array(absorption))))
            }
            _ => None,
        };
        if let Some((tint, ior, absorption)) = interface {
            if depth >= self.max_depth {
                return Vec3::ZERO;
            }
            let n = if hit.front_face {
                hit.outward_normal
            } else {
                -hit.outward_normal
            };
            let d = ray.direction().normalize();
            let (ei, et) = if hit.front_face {
                (1.0, ior)
            } else {
                (ior, 1.0)
            };
            let (transmitted, fresnel, eta_scale) = dielectric_interface(d, n, ei, et);
            let mut color = Vec3::ZERO;
            let rw = Vec3::splat(fresnel);
            if (throughput * rw).max_element() > self.min_throughput {
                let r = reflect(d, n).normalize();
                color += rw
                    * self.trace_recursive(
                        &Ray::new(
                            if incident.is_some() {
                                inside_origin(scene, &hit)
                            } else {
                                offset_origin(hit.point, hit.outward_normal, r)
                            },
                            r,
                        ),
                        scene,
                        background,
                        PathState {
                            depth: depth + 1,
                            throughput: throughput * rw,
                            key: key.fork(0),
                            medium: incident,
                            boundary: Some((hit.object_id, !hit.front_face)),
                        },
                    );
            }
            let tw = tint * ((1.0 - fresnel) * eta_scale);
            if let Some(t) = transmitted
                && (throughput * tw).max_element() > self.min_throughput
            {
                color += tw
                    * self.trace_recursive(
                        &Ray::new(
                            if hit.front_face && absorption.is_some() {
                                inside_origin(scene, &hit)
                            } else {
                                offset_origin(hit.point, hit.outward_normal, t)
                            },
                            t,
                        ),
                        scene,
                        background,
                        PathState {
                            depth: depth + 1,
                            throughput: throughput * tw,
                            key: key.fork(1),
                            medium: if hit.front_face {
                                absorption.map(|absorption| Medium {
                                    object_id: hit.object_id,
                                    absorption,
                                })
                            } else {
                                None
                            },
                            boundary: Some((hit.object_id, hit.front_face)),
                        },
                    );
            }
            return attenuation * color;
        }
        let n = hit.normal;
        let wo = -ray.direction().normalize();
        let geometric = if hit.front_face {
            hit.outward_normal
        } else {
            -hit.outward_normal
        };
        let valid = |wi: Vec3| n.dot(wi) > 0.0 && geometric.dot(wi) > 0.0;
        let mut color = Vec3::ZERO;
        for light in &scene.lights {
            let to_light = light.position - hit.point;
            let distance_squared = to_light.length_squared();
            if distance_squared <= 1e-16 {
                continue;
            }
            let wi = to_light / distance_squared.sqrt();
            if valid(wi) && visible(scene, &hit, wi, Some(light.position)) {
                color += material.eval(n, wo, wi) * light.color * (n.dot(wi) / distance_squared);
            }
        }
        for (id, light) in scene.area_lights.iter().enumerate() {
            if let Some(sample) = light.sample(
                hit.point,
                glam::Vec2::new(key.value(2 + 2 * id as u64), key.value(3 + 2 * id as u64)),
            ) && valid(sample.direction)
                && visible(scene, &hit, sample.direction, Some(sample.position))
            {
                color += material.eval(n, wo, sample.direction)
                    * sample.weight
                    * n.dot(sample.direction);
            }
        }
        if let Some(env) = &scene.environment {
            let sample = env.sample([key.value(4096), key.value(4097), key.value(4098)]);
            if sample.pdf > 0.0
                && valid(sample.direction)
                && visible(scene, &hit, sample.direction, None)
            {
                let bsdf_pdf = material.pdf(n, wo, sample.direction);
                color += material.eval(n, wo, sample.direction)
                    * sample.radiance
                    * (n.dot(sample.direction) * mis(sample.pdf, bsdf_pdf) / sample.pdf);
            }
            if let Some(sample) =
                material.sample(n, wo, [key.value(4100), key.value(4101), key.value(4102)])
                && valid(sample.direction)
                && visible(scene, &hit, sample.direction, None)
            {
                let env_pdf = env.pdf(sample.direction);
                color += sample.value
                    * env.eval(sample.direction)
                    * (n.dot(sample.direction) * mis(sample.pdf, env_pdf) / sample.pdf);
            }
        }
        attenuation * color
    }
}
fn transport_hit(
    scene: &Scene,
    ray: &Ray,
    boundary: Option<(usize, bool)>,
) -> Result<Option<Hit>, ()> {
    let near = ray.origin().abs().max_element().max(1e-4) * 32.0 * f32::EPSILON;
    let mut minimum = 0.0;
    for _ in 0..16 {
        let Some(hit) = scene.nearest_hit(ray, minimum, f32::INFINITY) else {
            return Ok(None);
        };
        // A known inside ray cannot enter that solid, nor an outside ray exit it.
        // At sharp facet edges,
        // a normal offset can straddle an adjacent face by a few representable
        // steps; discard only those near-origin contradictory self entries.
        if boundary.is_some_and(|(id, inside)| id == hit.object_id && hit.front_face == inside)
            && hit.t * ray.direction().length() <= near
        {
            minimum = hit.t.next_up();
            continue;
        }
        return Ok(Some(hit));
    }
    Err(())
}
fn inside_origin(scene: &Scene, hit: &Hit) -> Vec3 {
    let Some(bounds) = scene.shapes[hit.object_id].bounds() else {
        return offset_origin(hit.point, hit.outward_normal, -hit.outward_normal);
    };
    // Gemstone meshes validate a common interior kernel at their bounds center.
    // Moving toward that kernel stays inside every adjacent face at sharp edges.
    let inward = (bounds.centroid() - hit.point).normalize_or_zero();
    let mut point = hit.point + inward * (hit.point.abs().max_element().max(1e-4) * 4e-6);
    for axis in 0..3 {
        if inward[axis] > 0.0 {
            point[axis] = point[axis].next_up();
        }
        if inward[axis] < 0.0 {
            point[axis] = point[axis].next_down();
        }
    }
    point
}
fn visible(scene: &Scene, hit: &Hit, wi: Vec3, position: Option<Vec3>) -> bool {
    let origin = offset_origin(hit.point, hit.outward_normal, wi);
    let (direction, max) = position.map_or((wi, f32::INFINITY), |p| {
        let d = p - origin;
        (d.normalize(), d.length().next_down())
    });
    !scene.occluded(&Ray::new(origin, direction), 0.0, max)
}
fn mis(a: f32, b: f32) -> f32 {
    let a = a as f64;
    let b = b as f64;
    (a * a / (a * a + b * b).max(1e-300)) as f32
}
