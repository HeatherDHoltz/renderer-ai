//! Versioned JSON scenes. Deserialization never executes code or shell commands.
use crate::{
    camera::Camera,
    film::{LinearFilm, ToneMap},
    geometry::{Instance, Primitive},
    integrator::Whitted,
    material::Material,
    mesh::{Mesh, MeshInstance},
    scene::{PointLight, Scene},
    texture::{Filter, Texture, Wrap},
    transform::Transform,
};
use glam::{EulerRot, Mat4, Quat, Vec2, Vec3};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
    sync::Arc,
};

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SceneFile {
    pub version: u32,
    pub camera: CameraDef,
    #[serde(default)]
    pub render: RenderSettings,
    #[serde(default = "default_background")]
    pub background: [f32; 3],
    #[serde(default)]
    pub textures: BTreeMap<String, TextureDef>,
    pub materials: BTreeMap<String, MaterialDef>,
    pub geometries: BTreeMap<String, GeometryDef>,
    pub objects: Vec<ObjectDef>,
    #[serde(default)]
    pub lights: Vec<LightDef>,
}
fn default_background() -> [f32; 3] {
    [0.05, 0.07, 0.1]
}
fn one() -> [f32; 3] {
    [1.0; 3]
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct CameraDef {
    pub kind: String,
    pub position: [f32; 3],
    pub target: [f32; 3],
    pub up: [f32; 3],
    pub fov: f32,
    pub height: f32,
}
impl Default for CameraDef {
    fn default() -> Self {
        Self {
            kind: "perspective".into(),
            position: [4.0, 3.0, 7.0],
            target: [0.0, 1.0, 0.0],
            up: [0.0, 1.0, 0.0],
            fov: 40.0,
            height: 5.0,
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct RenderSettings {
    pub width: u32,
    pub height: u32,
    pub spp: u32,
    pub seed: u64,
    pub integrator: String,
    pub max_depth: u32,
    pub min_throughput: f32,
    pub exposure: f32,
    pub tone_map: String,
    pub accel: crate::accel::AccelKind,
}
impl Default for RenderSettings {
    fn default() -> Self {
        Self {
            width: 640,
            height: 480,
            spp: 1,
            seed: 116,
            integrator: "whitted".into(),
            max_depth: 8,
            min_throughput: 1e-4,
            exposure: 0.0,
            tone_map: "reinhard".into(),
            accel: crate::accel::AccelKind::Bvh,
        }
    }
}
impl RenderSettings {
    pub fn validate(&self) -> Result<(), String> {
        if self.width == 0
            || self.height == 0
            || self.width > 8192
            || self.height > 8192
            || u64::from(self.width) * u64::from(self.height) > 16_777_216
        {
            return Err("render dimensions must be 1..8192 and at most 16 megapixels".into());
        }
        if self.spp != 1 {
            return Err("only spp=1 is implemented before the sampling milestone".into());
        }
        if self.integrator != "whitted" {
            return Err("integrator must be whitted".into());
        }
        self.whitted()?;
        self.tone()?;
        if !self.exposure.is_finite() || !(-32.0..=32.0).contains(&self.exposure) {
            return Err("exposure must be in [-32,32] stops".into());
        }
        Ok(())
    }
    pub fn whitted(&self) -> Result<Whitted, String> {
        Whitted::new(self.max_depth, self.min_throughput)
    }
    pub fn tone(&self) -> Result<ToneMap, String> {
        match self.tone_map.as_str() {
            "reinhard" => Ok(ToneMap::Reinhard),
            "linear" => Ok(ToneMap::Linear),
            _ => Err("tone_map must be reinhard or linear".into()),
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum TextureDef {
    Checker {
        a: [f32; 3],
        b: [f32; 3],
        scale: [f32; 2],
    },
    Image {
        path: String,
        #[serde(default)]
        filter: Filter,
        #[serde(default)]
        wrap: Wrap,
    },
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct MaterialDef {
    pub diffuse: [f32; 3],
    pub specular: [f32; 3],
    pub shininess: f32,
    pub reflection: [f32; 3],
    pub transmission: [f32; 3],
    pub ior: f32,
    pub texture: Option<String>,
}
impl Default for MaterialDef {
    fn default() -> Self {
        let m = Material::default();
        Self {
            diffuse: m.diffuse.to_array(),
            specular: m.specular.to_array(),
            shininess: m.shininess,
            reflection: m.reflection.to_array(),
            transmission: m.transmission.to_array(),
            ior: m.ior,
            texture: None,
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum GeometryDef {
    Sphere,
    Plane,
    Box,
    Cylinder,
    Cone,
    Mesh { path: String },
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ObjectDef {
    pub name: String,
    #[serde(default)]
    pub parent: Option<String>,
    #[serde(default)]
    pub geometry: Option<String>,
    #[serde(default)]
    pub material: Option<String>,
    #[serde(default)]
    pub transform: TransformDef,
    #[serde(default)]
    pub smooth: bool,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct TransformDef {
    pub translation: [f32; 3],
    pub rotation_degrees: [f32; 3],
    pub scale: [f32; 3],
}
impl Default for TransformDef {
    fn default() -> Self {
        Self {
            translation: [0.0; 3],
            rotation_degrees: [0.0; 3],
            scale: one(),
        }
    }
}
impl TransformDef {
    pub fn matrix(&self) -> Result<Mat4, String> {
        if self
            .translation
            .iter()
            .chain(self.rotation_degrees.iter())
            .chain(self.scale.iter())
            .any(|v| !v.is_finite())
        {
            return Err("TRS components must be finite".into());
        }
        let r = Vec3::from_array(self.rotation_degrees) * std::f32::consts::PI / 180.0;
        let model = Mat4::from_scale_rotation_translation(
            self.scale.into(),
            Quat::from_euler(EulerRot::XYZ, r.x, r.y, r.z),
            self.translation.into(),
        );
        Transform::new(model)?;
        Ok(model)
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum LightDef {
    Point { position: [f32; 3], color: [f32; 3] },
}

pub struct LoadedScene {
    pub scene: Scene,
    pub camera: Camera,
    pub render: RenderSettings,
    pub background: Vec3,
    pub build_timings: BuildTimings,
}

#[derive(Clone, Copy, Default, Serialize)]
pub struct BuildTimings {
    pub total_seconds: f64,
    pub asset_seconds: f64,
    pub acceleration_seconds: f64,
}
impl LoadedScene {
    pub fn render(&self) -> Result<LinearFilm, String> {
        crate::render::render_whitted(
            &self.camera,
            &self.scene,
            self.render.width,
            self.render.height,
            self.background,
            self.render.whitted()?,
        )
    }
}

fn color(value: [f32; 3], label: &str) -> Result<Vec3, String> {
    let v = Vec3::from_array(value);
    if !v.is_finite() || v.min_element() < 0.0 {
        return Err(format!("{label} must be finite nonnegative linear RGB"));
    }
    Ok(v)
}

impl SceneFile {
    pub fn load(path: &Path) -> Result<Self, String> {
        if std::fs::metadata(path)
            .map_err(|e| format!("{}: {e}", path.display()))?
            .len()
            > 4 * 1024 * 1024
        {
            return Err("scene exceeds 4 MiB input limit".into());
        }
        serde_json::from_str(&std::fs::read_to_string(path).map_err(|e| e.to_string())?)
            .map_err(|e| format!("{}: {e}", path.display()))
    }
    pub fn build(&self, base: &Path) -> Result<LoadedScene, String> {
        let build_start = std::time::Instant::now();
        let mut build_timings = BuildTimings::default();
        if self.version != 1 {
            return Err(format!(
                "unsupported scene version {}; expected 1",
                self.version
            ));
        }
        self.render.validate()?;
        if self.objects.len() > 100_000
            || self.materials.len() > 4096
            || self.geometries.len() > 4096
            || self.textures.len() > 256
            || self.lights.len() > 1024
        {
            return Err("scene resource counts exceed supported limits".into());
        }
        let aspect = self.render.width as f32 / self.render.height as f32;
        let c = &self.camera;
        let camera = match c.kind.as_str() {
            "perspective" => Camera::perspective(
                c.position.into(),
                c.target.into(),
                c.up.into(),
                aspect,
                c.fov,
            )?,
            "orthographic" => Camera::orthographic(
                c.position.into(),
                c.target.into(),
                c.up.into(),
                aspect,
                c.height,
            )?,
            _ => return Err("camera kind must be perspective or orthographic".into()),
        };
        let mut scene = Scene::default();
        let mut texture_ids = BTreeMap::new();
        let mut texture_pixels = 0;
        for (name, def) in &self.textures {
            let asset_start = std::time::Instant::now();
            let texture = match def {
                TextureDef::Checker { a, b, scale } => {
                    let a = color(*a, "checker a")?;
                    let b = color(*b, "checker b")?;
                    let scale = Vec2::from_array(*scale);
                    if !scale.is_finite() || scale.min_element() <= 0.0 || scale.max_element() > 1e6
                    {
                        return Err(format!("texture {name}: checker scale must be in (0,1e6]"));
                    }
                    Texture::Checker { a, b, scale }
                }
                TextureDef::Image { path, filter, wrap } => {
                    Texture::load(&base.join(path), *filter, *wrap)?
                }
            };
            build_timings.asset_seconds += asset_start.elapsed().as_secs_f64();
            texture_pixels += texture.pixel_count();
            if texture_pixels > 16_777_216 {
                return Err("scene textures exceed 16 megapixels combined".into());
            }
            texture_ids.insert(name.clone(), scene.textures.len());
            scene.textures.push(texture);
        }
        let mut materials = BTreeMap::new();
        for (name, def) in &self.materials {
            let texture = def
                .texture
                .as_ref()
                .map(|n| {
                    texture_ids
                        .get(n)
                        .copied()
                        .ok_or_else(|| format!("material {name}: unknown texture {n}"))
                })
                .transpose()?;
            let m = Material {
                diffuse: def.diffuse.into(),
                specular: def.specular.into(),
                shininess: def.shininess,
                reflection: def.reflection.into(),
                transmission: def.transmission.into(),
                ior: def.ior,
                texture,
            };
            m.validate().map_err(|e| format!("material {name}: {e}"))?;
            materials.insert(name.clone(), m);
        }
        let mut meshes = BTreeMap::new();
        let mut mesh_elements = 0;
        for (name, def) in &self.geometries {
            if let GeometryDef::Mesh { path } = def {
                let asset_start = std::time::Instant::now();
                let mut mesh = Mesh::load(&base.join(path))?;
                build_timings.asset_seconds += asset_start.elapsed().as_secs_f64();
                let accel_start = std::time::Instant::now();
                mesh.build_accel(self.render.accel)?;
                build_timings.acceleration_seconds += accel_start.elapsed().as_secs_f64();
                mesh_elements += mesh.positions.len()
                    + mesh.triangles.len()
                    + mesh.normals.len()
                    + mesh.uvs.len();
                if mesh_elements > 4_000_000 {
                    return Err("scene meshes exceed four million combined elements".into());
                }
                meshes.insert(name.clone(), Arc::new(mesh));
            }
        }
        let mut names = BTreeMap::new();
        for (i, object) in self.objects.iter().enumerate() {
            if object.name.is_empty()
                || object.name.len() > 128
                || names.insert(object.name.as_str(), i).is_some()
            {
                return Err(format!(
                    "object name must be unique and 1..128 bytes: {:?}",
                    object.name
                ));
            }
        }
        // Iterative ancestor evaluation bounds stack usage and detects cycles.
        let mut world = vec![None; self.objects.len()];
        for start in 0..self.objects.len() {
            if world[start].is_some() {
                continue;
            }
            let mut chain = vec![];
            let mut seen = BTreeSet::new();
            let mut current = Some(start);
            while let Some(i) = current {
                if world[i].is_some() {
                    break;
                }
                if !seen.insert(i) {
                    return Err(format!(
                        "transform hierarchy cycle at {}",
                        self.objects[i].name
                    ));
                }
                if chain.len() >= 256 {
                    return Err("transform hierarchy exceeds 256 levels".into());
                }
                chain.push(i);
                current = self.objects[i]
                    .parent
                    .as_ref()
                    .map(|name| {
                        names.get(name.as_str()).copied().ok_or_else(|| {
                            format!("object {}: unknown parent {name}", self.objects[i].name)
                        })
                    })
                    .transpose()?;
            }
            for i in chain.into_iter().rev() {
                let object = &self.objects[i];
                let parent = object.parent.as_ref().map_or(Mat4::IDENTITY, |name| {
                    world[names[name.as_str()]].expect("evaluated parent")
                });
                let matrix = parent
                    * object
                        .transform
                        .matrix()
                        .map_err(|e| format!("object {}: {e}", object.name))?;
                Transform::new(matrix)?;
                world[i] = Some(matrix);
            }
        }
        for (i, object) in self.objects.iter().enumerate() {
            let Some(geometry_name) = &object.geometry else {
                if object.material.is_some() {
                    return Err(format!(
                        "group {} has a material but no geometry",
                        object.name
                    ));
                }
                continue;
            };
            let def = self.geometries.get(geometry_name).ok_or_else(|| {
                format!("object {}: unknown geometry {geometry_name}", object.name)
            })?;
            let material_name = object
                .material
                .as_ref()
                .ok_or_else(|| format!("object {} needs a material", object.name))?;
            let material = *materials.get(material_name).ok_or_else(|| {
                format!("object {}: unknown material {material_name}", object.name)
            })?;
            let matrix = world[i].expect("all transforms evaluated");
            if let GeometryDef::Mesh { .. } = def {
                scene.shapes.push(Box::new(MeshInstance::new(
                    meshes[geometry_name].clone(),
                    matrix,
                    material,
                    object.smooth,
                )?));
            } else {
                let primitive = match def {
                    GeometryDef::Sphere => Primitive::Sphere,
                    GeometryDef::Plane => Primitive::Plane,
                    GeometryDef::Box => Primitive::Box,
                    GeometryDef::Cylinder => Primitive::Cylinder,
                    GeometryDef::Cone => Primitive::Cone,
                    GeometryDef::Mesh { .. } => unreachable!(),
                };
                scene
                    .shapes
                    .push(Box::new(Instance::new(primitive, matrix, material)?));
            }
        }
        for light in &self.lights {
            match light {
                LightDef::Point { position, color: c } => {
                    let position = Vec3::from_array(*position);
                    if !position.is_finite() {
                        return Err("point light position must be finite".into());
                    }
                    scene.lights.push(PointLight {
                        position,
                        color: color(*c, "point light color")?,
                    });
                }
            }
        }
        let accel_start = std::time::Instant::now();
        scene.build_accel(self.render.accel)?;
        build_timings.acceleration_seconds += accel_start.elapsed().as_secs_f64();
        build_timings.total_seconds = build_start.elapsed().as_secs_f64();
        Ok(LoadedScene {
            scene,
            camera,
            render: self.render.clone(),
            background: color(self.background, "background")?,
            build_timings,
        })
    }
}
