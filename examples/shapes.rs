use glam::{Mat4, Quat, Vec3};
use renderer_project::{
    camera::Camera,
    film::ToneMap,
    geometry::{Instance, Primitive},
    material::Material,
    render::render_linear,
    scene::{PointLight, Scene},
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut scene = Scene {
        shapes: vec![],
        lights: vec![
            PointLight {
                position: Vec3::new(-4.0, 8.0, 5.0),
                color: Vec3::new(1.0, 0.9, 0.8),
            },
            PointLight {
                position: Vec3::new(5.0, 5.0, -2.0),
                color: Vec3::new(0.15, 0.25, 0.45),
            },
        ],
        textures: vec![],
        acceleration: None,
    };
    let material = |color| Material {
        diffuse: color,
        specular: Vec3::splat(0.3),
        shininess: 64.0,
        ..Default::default()
    };
    for (primitive, position, scale, color, angle) in [
        (
            Primitive::Sphere,
            Vec3::new(-4.0, 1.3, 0.0),
            Vec3::new(0.7, 1.3, 0.7),
            Vec3::new(0.03, 0.4, 0.33),
            -0.25,
        ),
        (
            Primitive::Box,
            Vec3::new(-1.5, 1.0, 0.0),
            Vec3::splat(0.8),
            Vec3::new(0.7, 0.17, 0.06),
            0.3,
        ),
        (
            Primitive::Cylinder,
            Vec3::new(1.0, 1.0, 0.0),
            Vec3::new(0.7, 1.0, 0.7),
            Vec3::new(0.12, 0.27, 0.65),
            0.0,
        ),
        (
            Primitive::Cone,
            Vec3::new(3.5, 1.2, 0.0),
            Vec3::new(0.9, 1.2, 0.9),
            Vec3::new(0.75, 0.45, 0.06),
            0.0,
        ),
    ] {
        let model =
            Mat4::from_scale_rotation_translation(scale, Quat::from_rotation_z(angle), position);
        scene
            .shapes
            .push(Box::new(Instance::new(primitive, model, material(color))?));
    }
    scene.shapes.push(Box::new(Instance::new(
        Primitive::Plane,
        Mat4::IDENTITY,
        material(Vec3::splat(0.25)),
    )?));
    std::fs::create_dir_all("output")?;
    for (name, camera) in [
        (
            "shapes",
            Camera::perspective(
                Vec3::new(6.0, 4.5, 15.0),
                Vec3::new(0.0, 1.0, 0.0),
                Vec3::Y,
                16.0 / 9.0,
                38.0,
            )?,
        ),
        (
            "orthographic",
            Camera::orthographic(
                Vec3::new(6.0, 4.5, 15.0),
                Vec3::new(0.0, 1.0, 0.0),
                Vec3::Y,
                16.0 / 9.0,
                6.0,
            )?,
        ),
    ] {
        render_linear(&camera, &scene, 960, 540, Vec3::new(0.06, 0.08, 0.12))?
            .display(0.0, ToneMap::Reinhard)?
            .save(format!("output/{name}.png"))?;
        println!("Saved output/{name}.png");
    }
    Ok(())
}
