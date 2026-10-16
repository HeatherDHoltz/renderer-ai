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
        Ok(mesh)
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
impl Shape for MeshInstance {
    fn hit(&self, ray: &Ray, t_min: f32, t_max: f32) -> Option<Hit> {
        let local = ray.transform(&self.transform.inverse());
        let o = local.origin().as_dvec3();
        let d = local.direction().as_dvec3();
        let mut closest = t_max;
        let mut result = None;
        for (primitive_id, triangle) in self.mesh.triangles.iter().enumerate() {
            let p = triangle.map(|c| self.mesh.positions[c.position].as_dvec3());
            let e1 = p[1] - p[0];
            let e2 = p[2] - p[0];
            let h = d.cross(e2);
            let det = e1.dot(h);
            if det.abs() <= 1e-12 * e1.length() * e2.length() * d.length() {
                continue;
            }
            let s = o - p[0];
            let beta = s.dot(h) / det;
            let q = s.cross(e1);
            let gamma = d.dot(q) / det;
            if beta < -1e-8 || gamma < -1e-8 || beta + gamma > 1.0 + 1e-8 {
                continue;
            }
            let t = (e2.dot(q) / det) as f32;
            if !t.is_finite() || t < t_min || t > closest || (result.is_some() && t == closest) {
                continue;
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
            if self.smooth {
                let n = self.transform.normal(normal);
                hit.normal = if hit.front_face { n } else { -n };
            }
            hit.barycentrics = Some(weights);
            hit.primitive_id = primitive_id;
            closest = t;
            result = Some(hit);
        }
        result
    }
}
