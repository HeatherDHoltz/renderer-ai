//! Offline, bounded scene generation; generated output is ordinary validated JSON.
use crate::{
    pbr::PhysicalMaterial,
    sampling::SampleKey,
    scene_io::{
        CameraDef, EnvironmentDef, GeometryDef, LightDef, MaterialDef, ObjectDef, RenderSettings,
        SceneFile, TransformDef,
    },
};
use glam::{EulerRot, Quat, Vec3};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path};

fn default_render() -> RenderSettings {
    RenderSettings {
        width: 768,
        height: 512,
        spp: 64,
        integrator: "physical".into(),
        ..RenderSettings::default()
    }
}
fn default_camera() -> CameraDef {
    CameraDef {
        position: [7.0, 5.0, 10.0],
        target: [0.0, 1.5, 0.0],
        fov: 38.0,
        ..CameraDef::default()
    }
}
fn default_palette() -> Vec<[f32; 3]> {
    vec![[0.04, 0.38, 0.22], [0.14, 0.5, 0.16], [0.55, 0.27, 0.055]]
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct GeneratorFile {
    pub version: u32,
    pub seed: u64,
    #[serde(default = "default_render")]
    pub render: RenderSettings,
    #[serde(default = "default_camera")]
    pub camera: CameraDef,
    #[serde(default = "default_palette")]
    pub palette: Vec<[f32; 3]>,
    pub generator: Generator,
}
#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ScatterShape {
    Sphere,
    Box,
    Cylinder,
    Cone,
}
impl ScatterShape {
    fn name(self) -> &'static str {
        match self {
            Self::Sphere => "sphere",
            Self::Box => "box",
            Self::Cylinder => "cylinder",
            Self::Cone => "cone",
        }
    }
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Generator {
    Scatter {
        count: usize,
        bounds_min: [f32; 2],
        bounds_max: [f32; 2],
        size: [f32; 2],
        shapes: Vec<ScatterShape>,
    },
    Lsystem {
        axiom: String,
        rules: BTreeMap<String, String>,
        iterations: u32,
        step: f32,
        angle_degrees: f32,
        radius: f32,
        taper: f32,
        leaf_size: f32,
        max_symbols: usize,
        max_segments: usize,
        count: usize,
        bounds_min: [f32; 2],
        bounds_max: [f32; 2],
    },
}

fn check_word(word: &str) -> Result<(), String> {
    let mut depth = 0usize;
    for c in word.chars() {
        match c {
            '[' => {
                depth += 1;
                if depth > 256 {
                    return Err("L-system branch stack exceeds 256".into());
                }
            }
            ']' => {
                if depth == 0 {
                    return Err("unbalanced L-system closing bracket".into());
                }
                depth -= 1;
            }
            'A'..='Z'
            | 'f'
            | '+'
            | '-'
            | '&'
            | '^'
            | '\\'
            | '/'
            | '|'
            | '!'
            | ' '
            | '\n'
            | '\r'
            | '\t' => {}
            _ => return Err(format!("unsupported L-system symbol {c:?}")),
        }
    }
    if depth != 0 {
        return Err("unbalanced L-system opening bracket".into());
    }
    Ok(())
}
pub fn expand(
    axiom: &str,
    rules: &BTreeMap<String, String>,
    iterations: u32,
    max_symbols: usize,
) -> Result<String, String> {
    if !(1..=1_000_000).contains(&max_symbols)
        || axiom.is_empty()
        || axiom.len() > max_symbols
        || iterations > 12
        || rules.len() > 32
    {
        return Err("L-system needs a nonempty axiom, <=32 rules, <=12 iterations, and 1..1000000 symbol budget".into());
    }
    check_word(axiom)?;
    for (symbol, replacement) in rules {
        if symbol.len() != 1 || !symbol.bytes().all(|c| c.is_ascii_uppercase() || c == b'f') {
            return Err("rewrite keys must be one uppercase ASCII letter or f".into());
        }
        if replacement.len() > max_symbols {
            return Err("L-system rule exceeds symbol budget".into());
        }
        check_word(replacement)?;
    }
    let mut word = axiom.to_string();
    for _ in 0..iterations {
        let mut next = String::new();
        for c in word.chars() {
            let literal = c.to_string();
            let replacement = rules.get(&literal).map_or(literal.as_str(), String::as_str);
            if next.len() + replacement.len() > max_symbols {
                return Err("L-system expansion exceeds max_symbols".into());
            }
            next.push_str(replacement);
        }
        check_word(&next)?;
        word = next;
    }
    if !word.contains('F') {
        return Err("L-system expansion has no F draw segments".into());
    }
    Ok(word)
}
fn bounds(min: [f32; 2], max: [f32; 2]) -> Result<(), String> {
    if min
        .iter()
        .chain(max.iter())
        .any(|v| !v.is_finite() || v.abs() > 1000.0)
        || min[0] >= max[0]
        || min[1] >= max[1]
    {
        return Err(
            "placement XZ bounds must be finite, increasing, and within [-1000,1000]".into(),
        );
    }
    Ok(())
}
fn object(
    name: String,
    geometry: &str,
    material: &str,
    translation: Vec3,
    rotation: Quat,
    scale: Vec3,
    parent: Option<String>,
) -> ObjectDef {
    let (x, y, z) = rotation.to_euler(EulerRot::XYZ);
    ObjectDef {
        name,
        geometry: Some(geometry.into()),
        material: Some(material.into()),
        parent,
        transform: TransformDef {
            translation: translation.to_array(),
            rotation_degrees: [x.to_degrees(), y.to_degrees(), z.to_degrees()],
            scale: scale.to_array(),
        },
        ..ObjectDef::default()
    }
}
impl GeneratorFile {
    pub fn load(path: &Path) -> Result<Self, String> {
        if std::fs::metadata(path).map_err(|e| e.to_string())?.len() > 1024 * 1024 {
            return Err("generator config exceeds 1 MiB".into());
        }
        serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())
    }
    pub fn generate(&self) -> Result<SceneFile, String> {
        if self.version != 1 {
            return Err("unsupported generator version; expected 1".into());
        }
        self.render.validate()?;
        if self.render.integrator != "physical" {
            return Err("generator render.integrator must be physical".into());
        }
        if self.palette.is_empty() || self.palette.len() > 64 {
            return Err("palette must contain 1..64 linear RGB colors".into());
        }
        let mut materials = BTreeMap::new();
        for (i, base_color) in self.palette.iter().enumerate() {
            let p = PhysicalMaterial::Diffuse {
                base_color: *base_color,
            };
            p.validate()?;
            materials.insert(
                format!("palette-{i}"),
                MaterialDef {
                    physical: Some(p),
                    ..MaterialDef::default()
                },
            );
        }
        for (name, color) in [("wood", [0.24, 0.10, 0.035]), ("ground", [0.24, 0.28, 0.3])] {
            materials.insert(
                name.into(),
                MaterialDef {
                    physical: Some(PhysicalMaterial::Diffuse { base_color: color }),
                    ..MaterialDef::default()
                },
            );
        }
        let mut file = SceneFile {
            version: 1,
            camera: self.camera.clone(),
            render: self.render.clone(),
            background: [0.05, 0.07, 0.1],
            textures: BTreeMap::new(),
            materials,
            geometries: BTreeMap::from([
                ("sphere".into(), GeometryDef::Sphere),
                ("box".into(), GeometryDef::Box),
                ("cylinder".into(), GeometryDef::Cylinder),
                ("cone".into(), GeometryDef::Cone),
                ("plane".into(), GeometryDef::Plane),
            ]),
            objects: vec![object(
                "ground".into(),
                "plane",
                "ground",
                Vec3::ZERO,
                Quat::IDENTITY,
                Vec3::ONE,
                None,
            )],
            lights: vec![LightDef::Area {
                center: [-3.0, 8.0, 4.0],
                edge_u: [4.0, 0.0, 0.0],
                edge_v: [0.0, 0.0, 4.0],
                radiance: [12.0, 11.0, 9.0],
                two_sided: false,
            }],
            environment: Some(EnvironmentDef::Constant {
                radiance: [0.22, 0.28, 0.4],
            }),
        };
        match &self.generator {
            Generator::Scatter {
                count,
                bounds_min,
                bounds_max,
                size,
                shapes,
            } => {
                bounds(*bounds_min, *bounds_max)?;
                if *count == 0
                    || *count > 20_000
                    || shapes.is_empty()
                    || shapes.len() > 16
                    || size
                        .iter()
                        .any(|s| !s.is_finite() || !(0.001..=100.0).contains(s))
                    || size[0] > size[1]
                {
                    return Err(
                        "scatter count must be 1..20000, shapes 1..16, ordered size in [0.001,100]"
                            .into(),
                    );
                }
                for i in 0..*count {
                    let key = SampleKey::new(self.seed, i as u64, 0);
                    let r = size[0] + (size[1] - size[0]) * key.value(2);
                    let position = Vec3::new(
                        bounds_min[0] + (bounds_max[0] - bounds_min[0]) * key.value(0),
                        r,
                        bounds_min[1] + (bounds_max[1] - bounds_min[1]) * key.value(1),
                    );
                    let geometry = shapes[(key.value(3) * shapes.len() as f32) as usize].name();
                    let material = format!(
                        "palette-{}",
                        (key.value(4) * self.palette.len() as f32) as usize
                    );
                    file.objects.push(object(
                        format!("scatter-{i:05}"),
                        geometry,
                        &material,
                        position,
                        Quat::from_rotation_y(key.value(5) * std::f32::consts::TAU),
                        Vec3::splat(r),
                        None,
                    ));
                }
            }
            Generator::Lsystem {
                axiom,
                rules,
                iterations,
                step,
                angle_degrees,
                radius,
                taper,
                leaf_size,
                max_symbols,
                max_segments,
                count,
                bounds_min,
                bounds_max,
            } => {
                bounds(*bounds_min, *bounds_max)?;
                if *count == 0
                    || *count > 64
                    || !(1..=50_000).contains(max_segments)
                    || !step.is_finite()
                    || !(0.0001..=100.0).contains(step)
                    || !angle_degrees.is_finite()
                    || !(0.0..=180.0).contains(angle_degrees)
                    || !radius.is_finite()
                    || !(0.0001..=10.0).contains(radius)
                    || !taper.is_finite()
                    || !(0.1..=1.0).contains(taper)
                    || !leaf_size.is_finite()
                    || !(0.001..=10.0).contains(leaf_size)
                {
                    return Err(
                        "invalid L-system count/segment budget/step/angle/radius/taper/leaf size"
                            .into(),
                    );
                }
                let word = expand(axiom, rules, *iterations, *max_symbols)?;
                let draws = word.bytes().filter(|c| *c == b'F').count();
                if draws.saturating_mul(*count) > *max_segments {
                    return Err("L-system exceeds max_segments across all trees".into());
                }
                let leaves = word.bytes().filter(|c| *c == b'L').count();
                if (draws + leaves + 1).saturating_mul(*count) + 1 > 100_000 {
                    return Err("L-system output exceeds 100000 scene objects".into());
                }
                let grid = (*count as f32).sqrt().ceil() as usize;
                for tree in 0..*count {
                    let key = SampleKey::new(self.seed, tree as u64, 0);
                    let x = (tree % grid) as f32 + 0.25 + 0.5 * key.value(0);
                    let z = (tree / grid) as f32 + 0.25 + 0.5 * key.value(1);
                    let parent = format!("tree-{tree:03}");
                    file.objects.push(ObjectDef {
                        name: parent.clone(),
                        transform: TransformDef {
                            translation: [
                                bounds_min[0] + (bounds_max[0] - bounds_min[0]) * x / grid as f32,
                                0.0,
                                bounds_min[1] + (bounds_max[1] - bounds_min[1]) * z / grid as f32,
                            ],
                            rotation_degrees: [0.0, 360.0 * key.value(2), 0.0],
                            ..TransformDef::default()
                        },
                        ..ObjectDef::default()
                    });
                    let leaf_material = format!(
                        "palette-{}",
                        (key.value(3) * self.palette.len() as f32) as usize
                    );
                    let mut state = Turtle {
                        position: Vec3::ZERO,
                        rotation: Quat::IDENTITY,
                        radius: *radius,
                    };
                    let mut stack = Vec::new();
                    let angle = angle_degrees.to_radians();
                    for (index, c) in word.chars().enumerate() {
                        match c {
                            'F' | 'f' => {
                                let end = state.position + state.rotation * Vec3::Y * *step;
                                if end.abs().max_element() > 10_000.0 {
                                    return Err("L-system turtle leaves supported local coordinate range +/-10000".into());
                                }
                                if c == 'F' {
                                    file.objects.push(object(
                                        format!("{parent}-branch-{index:06}"),
                                        "cylinder",
                                        "wood",
                                        (state.position + end) * 0.5,
                                        state.rotation,
                                        Vec3::new(state.radius, *step * 0.5, state.radius),
                                        Some(parent.clone()),
                                    ));
                                }
                                state.position = end;
                            }
                            'L' => file.objects.push(object(
                                format!("{parent}-leaf-{index:06}"),
                                "sphere",
                                &leaf_material,
                                state.position,
                                state.rotation,
                                Vec3::new(*leaf_size, *leaf_size * 0.5, *leaf_size),
                                Some(parent.clone()),
                            )),
                            '[' => stack.push(state),
                            ']' => state = stack.pop().expect("validated balanced word"),
                            '+' => state.rotation *= Quat::from_rotation_z(angle),
                            '-' => state.rotation *= Quat::from_rotation_z(-angle),
                            '&' => state.rotation *= Quat::from_rotation_x(angle),
                            '^' => state.rotation *= Quat::from_rotation_x(-angle),
                            '\\' => state.rotation *= Quat::from_rotation_y(angle),
                            '/' => state.rotation *= Quat::from_rotation_y(-angle),
                            '|' => state.rotation *= Quat::from_rotation_z(std::f32::consts::PI),
                            '!' => state.radius = (state.radius * *taper).max(0.0001),
                            _ => {} // Remaining uppercase symbols are inert nonterminals.
                        }
                        state.rotation = state.rotation.normalize();
                    }
                }
            }
        }
        // The same strict scene validator handles generated and hand-authored content.
        file.build(Path::new("."))?;
        if serde_json::to_vec_pretty(&file)
            .map_err(|e| e.to_string())?
            .len()
            > 4 * 1024 * 1024
        {
            return Err(
                "generated JSON exceeds the scene loader's 4 MiB limit; reduce generation".into(),
            );
        }
        Ok(file)
    }
}
#[derive(Clone, Copy)]
struct Turtle {
    position: Vec3,
    rotation: Quat,
    radius: f32,
}
