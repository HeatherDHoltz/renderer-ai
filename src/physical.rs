//! Direct physical lighting + ideal dielectric recursion; no diffuse interreflection.
use crate::{
    integrator::{offset_origin, reflect},
    pbr::{PhysicalMaterial, dielectric_interface},
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
            return scene
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
        if let PhysicalMaterial::Dielectric { tint, ior } = material {
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
                        &Ray::new(offset_origin(hit.point, hit.outward_normal, r), r),
                        scene,
                        background,
                        depth + 1,
                        throughput * rw,
                        key.fork(0),
                    );
            }
            let tw = Vec3::from_array(tint) * ((1.0 - fresnel) * eta_scale);
            if let Some(t) = transmitted
                && (throughput * tw).max_element() > self.min_throughput
            {
                color += tw
                    * self.trace_recursive(
                        &Ray::new(offset_origin(hit.point, hit.outward_normal, t), t),
                        scene,
                        background,
                        depth + 1,
                        throughput * tw,
                        key.fork(1),
                    );
            }
            return color;
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
        color
    }
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
