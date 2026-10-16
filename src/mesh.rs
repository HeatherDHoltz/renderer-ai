use crate::{
    material::Material,
    ray::Ray,
    shape::{Hit, Shape},
    transform::Transform,
};
use glam::{Mat4, Vec2, Vec3};
use std::{path::Path, sync::Arc};

#[derive(Clone, Copy, Debug)]
pub struct Corner {
    pub position: usize,
    pub uv: Option<usize>,
    pub normal: Option<usize>,
}
pub struct Mesh {
    pub positions: Vec<Vec3>,
    pub uvs: Vec<Vec2>,
    pub normals: Vec<Vec3>,
    pub triangles: Vec<[Corner; 3]>,
    generated_normals: Vec<Vec3>,
    bounds: Option<crate::accel::Aabb>,
    acceleration: Option<crate::accel::Acceleration>,
}

impl Mesh {
    pub fn load(path: &Path) -> Result<Self, String> {
        if std::fs::metadata(path)
            .map_err(|e| format!("{}: {e}", path.display()))?
            .len()
            > 64 * 1024 * 1024
        {
            return Err("OBJ exceeds 64 MiB limit".into());
        }
        Self::parse(&std::fs::read_to_string(path).map_err(|e| e.to_string())?)
            .map_err(|e| format!("{}: {e}", path.display()))
    }
    pub fn parse(text: &str) -> Result<Self, String> {
        if text.len() > 64 * 1024 * 1024 {
            return Err("OBJ exceeds 64 MiB limit".into());
        }
        let mut mesh = Self {
            positions: vec![],
            uvs: vec![],
            normals: vec![],
            triangles: vec![],
            generated_normals: vec![],
            bounds: None,
            acceleration: None,
        };
        for (line_number, line) in text.lines().enumerate() {
            let tokens: Vec<_> = line
                .split('#')
                .next()
                .unwrap_or("")
                .split_whitespace()
                .take(10)
                .collect();
            if tokens.is_empty() {
                continue;
            }
            let fail = |s: &str| format!("OBJ line {}: {s}", line_number + 1);
            let float = |index: usize| -> Result<f32, String> {
                let value = tokens
                    .get(index)
                    .ok_or_else(|| fail("missing coordinate"))?
                    .parse::<f32>()
                    .map_err(|_| fail("invalid float"))?;
                if !value.is_finite() || value.abs() > 1e8 {
                    return Err(fail("coordinate must be finite and within ±1e8"));
                }
                Ok(value)
            };
            match tokens[0] {
                "v" => {
                    if tokens.len() != 4 {
                        return Err(fail("only 3-component vertex positions supported"));
                    }
                    mesh.positions
                        .push(Vec3::new(float(1)?, float(2)?, float(3)?));
                }
                "vt" => {
                    if !(3..=4).contains(&tokens.len()) {
                        return Err(fail("UV needs 2 components"));
                    }
                    mesh.uvs.push(Vec2::new(float(1)?, float(2)?));
                }
                "vn" => {
                    if tokens.len() != 4 {
                        return Err(fail("normal needs 3 components"));
                    }
                    let n = Vec3::new(float(1)?, float(2)?, float(3)?);
                    if n.length_squared() < 1e-16 {
                        return Err(fail("zero normal"));
                    }
                    mesh.normals.push(n.normalize());
                }
                "f" => {
                    if tokens.len() != 4 && tokens.len() != 5 {
                        return Err(fail(
                            "only triangles and convex planar quads supported; triangulate polygons first",
                        ));
                    }
                    let mut corners = vec![];
                    for token in &tokens[1..] {
                        let indices: Vec<_> = token.split('/').collect();
                        if indices.len() > 3 {
                            return Err(fail("invalid face index form"));
                        }
                        let index = |slot: usize, size: usize| -> Result<Option<usize>, String> {
                            let Some(value) = indices.get(slot).filter(|s| !s.is_empty()) else {
                                return Ok(None);
                            };
                            let i = value
                                .parse::<i64>()
                                .map_err(|_| fail("invalid face index"))?;
                            let i = if i > 0 {
                                i - 1
                            } else if i < 0 {
                                size as i64 + i
                            } else {
                                return Err(fail("OBJ indices cannot be zero"));
                            };
                            if i < 0 || i >= size as i64 {
                                return Err(fail("face index out of range"));
                            }
                            Ok(Some(i as usize))
                        };
                        corners.push(Corner {
                            position: index(0, mesh.positions.len())?
                                .ok_or_else(|| fail("missing position index"))?,
                            uv: index(1, mesh.uvs.len())?,
                            normal: index(2, mesh.normals.len())?,
                        });
                    }
                    let first = mesh.positions[corners[0].position];
                    let normal = (mesh.positions[corners[1].position] - first)
                        .cross(mesh.positions[corners[2].position] - first);
                    if normal.length_squared() < 1e-16 {
                        return Err(fail("zero-area triangle"));
                    }
                    if corners.len() == 4 {
                        let points: Vec<_> =
                            corners.iter().map(|c| mesh.positions[c.position]).collect();
                        let n = normal.normalize();
                        let extent = points
                            .iter()
                            .map(|p| (*p - first).length())
                            .fold(0.0_f32, f32::max);
                        if (points[3] - first).dot(n).abs() > 1e-5 * extent.max(1.0) {
                            return Err(fail("nonplanar quad; triangulate first"));
                        }
                        for i in 0..4 {
                            if (points[(i + 1) % 4] - points[i])
                                .cross(points[(i + 2) % 4] - points[(i + 1) % 4])
                                .dot(n)
                                <= 0.0
                            {
                                return Err(fail("quad must be convex with consistent winding"));
                            }
                        }
                    }
                    for i in 1..corners.len() - 1 {
                        mesh.triangles
                            .push([corners[0], corners[i], corners[i + 1]]);
                    }
                }
                "o" | "g" | "s" | "mtllib" | "usemtl" => {}
                _ => return Err(fail("unsupported OBJ directive")),
            }
            if mesh.positions.len() > 1_000_000
                || mesh.triangles.len() > 1_000_000
                || mesh.normals.len() > 1_000_000
                || mesh.uvs.len() > 1_000_000
            {
                return Err(fail("mesh exceeds one-million-element limit"));
            }
        }
        if mesh.triangles.is_empty() {
            return Err("OBJ contains no triangles".into());
        }
        mesh.generated_normals = vec![Vec3::ZERO; mesh.positions.len()];
        for triangle in &mesh.triangles {
            let p = triangle.map(|c| mesh.positions[c.position]);
            let normal = (p[1] - p[0]).cross(p[2] - p[0]);
            for corner in triangle {
                mesh.generated_normals[corner.position] += normal;
            }
        }
        for n in &mut mesh.generated_normals {
            *n = n.normalize_or_zero();
        }
        mesh.build_accel(crate::accel::AccelKind::None)?;
        Ok(mesh)
    }
}

impl Mesh {
    /// Absorbing solids need a closed oriented surface and a common interior
    /// kernel at the bounds center, so sharp-edge offsets can move safely inward.
    pub fn validate_absorbing_solid(&self) -> Result<(), String> {
        use std::collections::BTreeMap;
        if self.triangles.len() > 100_000 || self.positions.len() > 200_000 {
            return Err(
                "absorbing gemstone meshes support at most 100000 triangles/200000 positions"
                    .into(),
            );
        }
        let bounds = self.bounds.ok_or("absorbing mesh has no bounds")?;
        let center = bounds.centroid().as_dvec3();
        let tolerance = (bounds.max - bounds.min).as_dvec3().length() * 1e-9;
        let mut unique = BTreeMap::new();
        let indices: Vec<_> = self
            .positions
            .iter()
            .map(|p| {
                let key = p.to_array().map(|x| if x == 0.0 { 0 } else { x.to_bits() });
                let next = unique.len();
                *unique.entry(key).or_insert(next)
            })
            .collect();
        let mut edges: BTreeMap<(usize, usize), (usize, i32)> = BTreeMap::new();
        for triangle in &self.triangles {
            let p = triangle.map(|c| self.positions[c.position].as_dvec3());
            let normal = (p[1] - p[0]).cross(p[2] - p[0]);
            if normal.dot(center - p[0]) >= -tolerance * normal.length() {
                return Err("absorbing mesh requires outward facets with its bounds center strictly inside every face plane".into());
            }
            for i in 0..3 {
                let a = indices[triangle[i].position];
                let b = indices[triangle[(i + 1) % 3].position];
                let (key, sign) = if a < b { ((a, b), 1) } else { ((b, a), -1) };
                let edge = edges.entry(key).or_default();
                edge.0 += 1;
                edge.1 += sign;
            }
        }
        if edges
            .values()
            .any(|(count, balance)| *count != 2 || *balance != 0)
        {
            return Err("absorbing mesh must be watertight with consistent outward winding".into());
        }
        Ok(())
    }
    pub fn build_accel(&mut self, kind: crate::accel::AccelKind) -> Result<(), String> {
        let boxes: Vec<_> = self
            .triangles
            .iter()
            .map(|triangle| {
                let p = triangle.map(|c| self.positions[c.position]);
                Some(
                    crate::accel::Aabb {
                        min: p[0].min(p[1]).min(p[2]),
                        max: p[0].max(p[1]).max(p[2]),
                    }
                    .padded(),
                )
            })
            .collect();
        self.bounds = boxes
            .iter()
            .flatten()
            .copied()
            .reduce(crate::accel::Aabb::union);
        self.acceleration = Some(crate::accel::Acceleration::build(kind, &boxes)?);
        Ok(())
    }
}

pub struct MeshInstance {
    pub mesh: Arc<Mesh>,
    pub transform: Transform,
    pub material: Material,
    pub smooth: bool,
}
impl MeshInstance {
    pub fn new(
        mesh: Arc<Mesh>,
        model: Mat4,
        material: Material,
        smooth: bool,
    ) -> Result<Self, String> {
        Ok(Self {
            mesh,
            transform: Transform::new(model)?,
            material,
            smooth,
        })
    }
}
impl MeshInstance {
    fn triangle_hit(
        &self,
        primitive_id: usize,
        ray: &Ray,
        local: &Ray,
        t_min: f32,
        t_max: f32,
    ) -> Option<Hit> {
        let triangle = &self.mesh.triangles[primitive_id];
        let o = local.origin().as_dvec3();
        let d = local.direction().as_dvec3();
        let p = triangle.map(|c| self.mesh.positions[c.position].as_dvec3());
        let e1 = p[1] - p[0];
        let e2 = p[2] - p[0];
        let h = d.cross(e2);
        let det = e1.dot(h);
        if det.abs() <= 1e-12 * e1.length() * e2.length() * d.length() {
            return None;
        }
        let s = o - p[0];
        let beta = s.dot(h) / det;
        let q = s.cross(e1);
        let gamma = d.dot(q) / det;
        if beta < -1e-8 || gamma < -1e-8 || beta + gamma > 1.0 + 1e-8 {
            return None;
        }
        let t = (e2.dot(q) / det) as f32;
        if !t.is_finite() || t < t_min || t > t_max {
            return None;
        }
        let weights = Vec3::new((1.0 - beta - gamma) as f32, beta as f32, gamma as f32);
        let geom = e1.cross(e2).as_vec3().normalize();
        let mut normal = Vec3::ZERO;
        let mut uv = Vec2::ZERO;
        for i in 0..3 {
            normal += triangle[i]
                .normal
                .map_or(self.mesh.generated_normals[triangle[i].position], |n| {
                    self.mesh.normals[n]
                })
                * weights[i];
            uv += triangle[i].uv.map_or(Vec2::ZERO, |i| self.mesh.uvs[i]) * weights[i];
        }
        if normal.length_squared() < 1e-16 {
            normal = geom;
        }
        if normal.dot(geom) < 0.0 {
            normal = -normal;
        }
        // Orientation follows the local mesh's winding even under mirrored instances.
        let outward = self.transform.normal(geom);
        let mut hit = Hit::new(ray, t, outward, self.material, uv);
        // Reconstruct on the triangle, rather than cancelling a long camera ray
        // against its origin with a rounded f32 t. Small faceted solids need the
        // hit point to lie on the surface before applying the geometric offset.
        let local_point = p[0] + e1 * beta + e2 * gamma;
        hit.point = self
            .transform
            .model()
            .as_dmat4()
            .transform_point3(local_point)
            .as_vec3();
        if self.smooth {
            let n = self.transform.normal(normal);
            hit.normal = if hit.front_face { n } else { -n };
        }
        hit.barycentrics = Some(weights);
        hit.primitive_id = primitive_id;
        Some(hit)
    }
    fn trace<const MEASURE: bool>(
        &self,
        ray: &Ray,
        t_min: f32,
        t_max: f32,
        stats: &mut crate::accel::TraceStats,
    ) -> Option<Hit> {
        let local = ray.transform(&self.transform.inverse());
        self.mesh
            .acceleration
            .as_ref()
            .expect("mesh built at parse")
            .closest::<_, MEASURE>(&local, t_min, t_max, stats, |id, max, stats| {
                if MEASURE {
                    stats.primitive_tests += 1;
                }
                self.triangle_hit(id, ray, &local, t_min, max)
                    .map(|hit| (hit.t, hit))
            })
    }
    fn any<const MEASURE: bool>(
        &self,
        ray: &Ray,
        t_min: f32,
        t_max: f32,
        stats: &mut crate::accel::TraceStats,
    ) -> bool {
        let local = ray.transform(&self.transform.inverse());
        self.mesh
            .acceleration
            .as_ref()
            .expect("mesh built at parse")
            .any::<MEASURE>(&local, t_min, t_max, stats, |id, stats| {
                if MEASURE {
                    stats.primitive_tests += 1;
                }
                self.triangle_hit(id, ray, &local, t_min, t_max).is_some()
            })
    }
}
impl Shape for MeshInstance {
    fn bounds(&self) -> Option<crate::accel::Aabb> {
        self.mesh
            .bounds
            .map(|b| b.transform(self.transform.model()))
    }
    fn triangle_count(&self) -> usize {
        self.mesh.triangles.len()
    }
    fn primitive_count(&self) -> usize {
        self.mesh.triangles.len()
    }
    fn hit(&self, ray: &Ray, t_min: f32, t_max: f32) -> Option<Hit> {
        self.trace::<false>(ray, t_min, t_max, &mut crate::accel::TraceStats::default())
    }
    fn hit_with_stats(
        &self,
        ray: &Ray,
        t_min: f32,
        t_max: f32,
        stats: &mut crate::accel::TraceStats,
    ) -> Option<Hit> {
        self.trace::<true>(ray, t_min, t_max, stats)
    }
    fn occluded(&self, ray: &Ray, t_min: f32, t_max: f32) -> bool {
        self.any::<false>(ray, t_min, t_max, &mut crate::accel::TraceStats::default())
    }
    fn occluded_with_stats(
        &self,
        ray: &Ray,
        t_min: f32,
        t_max: f32,
        stats: &mut crate::accel::TraceStats,
    ) -> bool {
        self.any::<true>(ray, t_min, t_max, stats)
    }
}
