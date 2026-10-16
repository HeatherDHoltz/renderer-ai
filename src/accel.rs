//! Shared index acceleration for scene instances and mesh-local triangles.
use crate::ray::Ray;
use glam::{Mat4, Vec3};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize, clap::ValueEnum)]
#[serde(rename_all = "snake_case")]
pub enum AccelKind {
    None,
    #[default]
    Bvh,
    Octree,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Aabb {
    pub min: Vec3,
    pub max: Vec3,
}
impl Aabb {
    pub fn new(min: Vec3, max: Vec3) -> Result<Self, String> {
        let bounds = Self { min, max };
        if !bounds.valid() {
            return Err("AABB must be finite with min <= max".into());
        }
        Ok(bounds)
    }
    pub fn valid(self) -> bool {
        self.min.is_finite() && self.max.is_finite() && self.min.cmple(self.max).all()
    }
    pub fn union(self, other: Self) -> Self {
        Self {
            min: self.min.min(other.min),
            max: self.max.max(other.max),
        }
    }
    pub fn centroid(self) -> Vec3 {
        self.min * 0.5 + self.max * 0.5
    }
    pub fn area(self) -> f64 {
        let d = (self.max - self.min).as_dvec3();
        2.0 * (d.x * d.y + d.y * d.z + d.z * d.x)
    }
    pub fn padded(self) -> Self {
        let pad = self.min.abs().max(self.max.abs()).max(Vec3::splat(1e-4)) * 2e-6;
        Self {
            min: self.min - pad,
            max: self.max + pad,
        }
    }
    pub fn transform(self, model: Mat4) -> Self {
        let mut bounds = None;
        for mask in 0..8 {
            let p = Vec3::new(
                if mask & 1 == 0 {
                    self.min.x
                } else {
                    self.max.x
                },
                if mask & 2 == 0 {
                    self.min.y
                } else {
                    self.max.y
                },
                if mask & 4 == 0 {
                    self.min.z
                } else {
                    self.max.z
                },
            );
            let p = model.transform_point3(p);
            let b = Self { min: p, max: p };
            bounds = Some(bounds.map_or(b, |a: Self| a.union(b)));
        }
        bounds.expect("eight corners").padded()
    }
    pub fn interval(self, ray: &Ray, t_min: f32, t_max: f32) -> Option<(f32, f32)> {
        if t_min.is_nan()
            || t_max.is_nan()
            || t_min > t_max
            || !ray.origin().is_finite()
            || !ray.direction().is_finite()
            || ray.direction() == Vec3::ZERO
        {
            return None;
        }
        let o = ray.origin().as_dvec3();
        let d = ray.direction().as_dvec3();
        let min = self.min.as_dvec3();
        let max = self.max.as_dvec3();
        let mut near = t_min as f64;
        let mut far = t_max as f64;
        for axis in 0..3 {
            if d[axis] == 0.0 {
                if o[axis] < min[axis] || o[axis] > max[axis] {
                    return None;
                }
                continue;
            }
            let a = (min[axis] - o[axis]) / d[axis];
            let b = (max[axis] - o[axis]) / d[axis];
            near = near.max(a.min(b));
            far = far.min(a.max(b));
            if near > far {
                return None;
            }
        }
        Some((near as f32, far as f32))
    }
}

#[derive(Clone, Copy, Debug, Default, Serialize)]
pub struct TraceStats {
    pub node_visits: u64,
    pub instance_tests: u64,
    pub primitive_tests: u64,
}

struct Node {
    bounds: Aabb,
    children: [usize; 8],
    child_count: usize,
    start: usize,
    count: usize,
}
pub struct Acceleration {
    kind: AccelKind,
    nodes: Vec<Node>,
    indices: Vec<usize>,
    unbounded: Vec<usize>,
}

impl Acceleration {
    pub fn build(kind: AccelKind, bounds: &[Option<Aabb>]) -> Result<Self, String> {
        if bounds.iter().flatten().any(|b| !b.valid()) {
            return Err("acceleration received invalid bounds".into());
        }
        let mut result = Self {
            kind,
            nodes: vec![],
            indices: vec![],
            unbounded: vec![],
        };
        let mut finite = vec![];
        for (i, b) in bounds.iter().enumerate() {
            if b.is_some() && kind != AccelKind::None {
                finite.push(i);
            } else {
                result.unbounded.push(i);
            }
        }
        if !finite.is_empty() {
            let root = union_ids(&finite, bounds);
            result.build_node(finite, root, bounds, 0);
        }
        Ok(result)
    }
    pub fn kind(&self) -> AccelKind {
        self.kind
    }
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }
    fn build_node(
        &mut self,
        ids: Vec<usize>,
        bounds: Aabb,
        all: &[Option<Aabb>],
        depth: usize,
    ) -> usize {
        let index = self.nodes.len();
        self.nodes.push(Node {
            bounds,
            children: [0; 8],
            child_count: 0,
            start: 0,
            count: 0,
        });
        let limit = if self.kind == AccelKind::Bvh { 48 } else { 16 };
        let (retained, groups) = if ids.len() <= 4 || depth >= limit {
            (ids, vec![])
        } else if self.kind == AccelKind::Bvh {
            self.bvh_partition(ids, bounds, all)
        } else {
            self.octree_partition(ids, bounds, all)
        };
        self.nodes[index].start = self.indices.len();
        self.nodes[index].count = retained.len();
        self.indices.extend(retained);
        for (child_ids, child_bounds) in groups {
            let child = self.build_node(child_ids, child_bounds, all, depth + 1);
            let n = &mut self.nodes[index];
            n.children[n.child_count] = child;
            n.child_count += 1;
        }
        index
    }
    fn bvh_partition(
        &self,
        ids: Vec<usize>,
        bounds: Aabb,
        all: &[Option<Aabb>],
    ) -> (Vec<usize>, Vec<(Vec<usize>, Aabb)>) {
        const BINS: usize = 12;
        let mut centroids = Aabb {
            min: Vec3::splat(f32::INFINITY),
            max: Vec3::splat(f32::NEG_INFINITY),
        };
        for &id in &ids {
            let c = all[id].unwrap().centroid();
            centroids.min = centroids.min.min(c);
            centroids.max = centroids.max.max(c);
        }
        let mut best_cost = ids.len() as f64;
        let mut best = None;
        for axis in 0..3 {
            let extent = centroids.max[axis] - centroids.min[axis];
            if extent <= 0.0 {
                continue;
            }
            let bin = |id: usize| {
                (((all[id].unwrap().centroid()[axis] - centroids.min[axis]) / extent * BINS as f32)
                    as usize)
                    .min(BINS - 1)
            };
            let mut counts = [0; BINS];
            let mut boxes: [Option<Aabb>; BINS] = [None; BINS];
            for &id in &ids {
                let b = bin(id);
                counts[b] += 1;
                boxes[b] = Some(boxes[b].map_or(all[id].unwrap(), |v| v.union(all[id].unwrap())));
            }
            for split in 0..BINS - 1 {
                let mut left = None;
                let mut right = None;
                let mut lc = 0;
                let mut rc = 0;
                for b in 0..BINS {
                    if let Some(a) = boxes[b] {
                        if b <= split {
                            lc += counts[b];
                            left = Some(left.map_or(a, |v: Aabb| v.union(a)));
                        } else {
                            rc += counts[b];
                            right = Some(right.map_or(a, |v: Aabb| v.union(a)));
                        }
                    }
                }
                if let (Some(l), Some(r)) = (left, right) {
                    let cost = 1.0
                        + (l.area() * lc as f64 + r.area() * rc as f64) / bounds.area().max(1e-30);
                    if cost < best_cost {
                        best_cost = cost;
                        best = Some((axis, split, centroids.min[axis], extent));
                    }
                }
            }
        }
        let Some((axis, split, min, extent)) = best else {
            return (ids, vec![]);
        };
        let (left, right): (Vec<_>, Vec<_>) = ids.into_iter().partition(|&id| {
            (((all[id].unwrap().centroid()[axis] - min) / extent * BINS as f32) as usize)
                .min(BINS - 1)
                <= split
        });
        if left.is_empty() || right.is_empty() {
            let mut ids = left;
            ids.extend(right);
            return (ids, vec![]);
        }
        let l = union_ids(&left, all);
        let r = union_ids(&right, all);
        (vec![], vec![(left, l), (right, r)])
    }
    fn octree_partition(
        &self,
        ids: Vec<usize>,
        bounds: Aabb,
        all: &[Option<Aabb>],
    ) -> (Vec<usize>, Vec<(Vec<usize>, Aabb)>) {
        let center = bounds.centroid();
        let mut groups: [Vec<usize>; 8] = std::array::from_fn(|_| vec![]);
        let mut retained = vec![];
        for id in ids {
            let b = all[id].unwrap();
            let mut cell = 0;
            let mut straddles = false;
            for axis in 0..3 {
                if b.max[axis] <= center[axis] {
                } else if b.min[axis] >= center[axis] {
                    cell |= 1 << axis;
                } else {
                    straddles = true;
                    break;
                }
            }
            if straddles {
                retained.push(id);
            } else {
                groups[cell].push(id);
            }
        }
        let mut children = vec![];
        for (cell, ids) in groups.into_iter().enumerate() {
            if ids.is_empty() {
                continue;
            }
            let mut b = bounds;
            for axis in 0..3 {
                if cell & (1 << axis) == 0 {
                    b.max[axis] = center[axis];
                } else {
                    b.min[axis] = center[axis];
                }
            }
            children.push((ids, b));
        }
        (retained, children)
    }

    /// Inclusive bounds preserve exact ties; the lowest input index wins them.
    pub fn closest<T, const MEASURE: bool>(
        &self,
        ray: &Ray,
        t_min: f32,
        t_max: f32,
        stats: &mut TraceStats,
        mut visit: impl FnMut(usize, f32, &mut TraceStats) -> Option<(f32, T)>,
    ) -> Option<T> {
        let mut closest = t_max;
        let mut best_id = usize::MAX;
        let mut result = None;
        for &id in &self.unbounded {
            if let Some((t, value)) = visit(id, closest, stats)
                && (t < closest || (t == closest && id < best_id))
            {
                closest = t;
                best_id = id;
                result = Some(value);
            }
        }
        if self.nodes.is_empty() {
            return result;
        }
        let mut stack = [0usize; 256];
        let mut len = 1;
        while len > 0 {
            len -= 1;
            let node = &self.nodes[stack[len]];
            if MEASURE {
                stats.node_visits += 1;
            }
            if node.bounds.interval(ray, t_min, closest).is_none() {
                continue;
            }
            for &id in &self.indices[node.start..node.start + node.count] {
                if let Some((t, value)) = visit(id, closest, stats)
                    && (t < closest || (t == closest && id < best_id))
                {
                    closest = t;
                    best_id = id;
                    result = Some(value);
                }
            }
            let mut children = [(0.0, 0usize); 8];
            let mut count = 0;
            for &id in &node.children[..node.child_count] {
                if let Some((near, _)) = self.nodes[id].bounds.interval(ray, t_min, closest) {
                    children[count] = (near, id);
                    count += 1;
                }
            }
            children[..count].sort_unstable_by(|a, b| b.0.total_cmp(&a.0).then(b.1.cmp(&a.1)));
            for &(_, id) in &children[..count] {
                debug_assert!(len < stack.len());
                stack[len] = id;
                len += 1;
            }
        }
        result
    }
    pub fn any<const MEASURE: bool>(
        &self,
        ray: &Ray,
        t_min: f32,
        t_max: f32,
        stats: &mut TraceStats,
        mut visit: impl FnMut(usize, &mut TraceStats) -> bool,
    ) -> bool {
        for &id in &self.unbounded {
            if visit(id, stats) {
                return true;
            }
        }
        if self.nodes.is_empty() {
            return false;
        }
        let mut stack = [0usize; 256];
        let mut len = 1;
        while len > 0 {
            len -= 1;
            let node = &self.nodes[stack[len]];
            if MEASURE {
                stats.node_visits += 1;
            }
            if node.bounds.interval(ray, t_min, t_max).is_none() {
                continue;
            }
            for &id in &self.indices[node.start..node.start + node.count] {
                if visit(id, stats) {
                    return true;
                }
            }
            for &id in &node.children[..node.child_count] {
                debug_assert!(len < stack.len());
                stack[len] = id;
                len += 1;
            }
        }
        false
    }
}
fn union_ids(ids: &[usize], bounds: &[Option<Aabb>]) -> Aabb {
    ids.iter()
        .map(|&id| bounds[id].expect("finite primitive"))
        .reduce(Aabb::union)
        .expect("nonempty node")
}
