use glam::{Mat4, Vec3};
use renderer_project::{
    camera::Camera,
    film::ToneMap,
    geometry::{Instance, Primitive},
    material::Material,
    plane::Plane,
    render::render_linear,
    scene::{PointLight, Scene},
    sphere::Sphere,
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    std::fs::create_dir_all("output")?;
    let matte = |diffuse| Material {
        diffuse,
        specular: Vec3::splat(0.2),
        shininess: 64.0,
        ..Material::default()
    };
    let scene = Scene {
        shapes: vec![
            Box::new(Sphere::new(
                Vec3::new(-1.25, 1.05, 0.25),
                1.05,
                Material::glass(Vec3::ONE, 1.5),
            )),
            Box::new(Sphere::new(
                Vec3::new(1.3, 1.05, 0.0),
                1.05,
                Material::mirror(Vec3::new(0.94, 0.84, 0.68)),
            )),
            Box::new(Instance::new(
                Primitive::Cone,
                Mat4::from_translation(Vec3::new(-2.5, 1.2, -2.4))
                    * Mat4::from_scale(Vec3::new(0.85, 1.2, 0.85)),
                matte(Vec3::new(0.85, 0.12, 0.035)),
            )?),
            Box::new(Instance::new(
                Primitive::Box,
                Mat4::from_translation(Vec3::new(0.1, 0.8, -2.7))
                    * Mat4::from_rotation_y(0.35)
                    * Mat4::from_scale(Vec3::splat(0.8)),
                matte(Vec3::new(0.04, 0.45, 0.42)),
            )?),
            Box::new(Sphere::new(
                Vec3::new(3.0, 0.65, -1.8),
                0.65,
                Material::glass(Vec3::new(0.55, 0.85, 1.0), 1.33),
            )),
            Box::new(Plane::new(
                Vec3::ZERO,
                Vec3::Y,
                Material {
                    diffuse: Vec3::splat(0.22),
                    reflection: Vec3::splat(0.14),
                    ..Material::default()
                },
            )),
        ],
        lights: vec![
            PointLight {
                position: Vec3::new(-3.0, 7.0, 4.0),
                color: Vec3::new(1.5, 1.35, 1.15),
            },
            PointLight {
                position: Vec3::new(5.0, 4.0, -3.0),
                color: Vec3::new(0.25, 0.45, 0.85),
            },
        ],
        textures: vec![],
        area_lights: vec![],
        acceleration: None,
        environment: None,
    };
    let camera = Camera::perspective(
        Vec3::new(5.0, 3.5, 10.0),
        Vec3::new(0.0, 0.9, -0.5),
        Vec3::Y,
        1.5,
        38.0,
    )?;
    render_linear(&camera, &scene, 960, 640, Vec3::new(0.15, 0.2, 0.3))?
        .display(0.0, ToneMap::Reinhard)?
        .save("output/glass.png")?;
    let inside = Camera::perspective(
        Vec3::new(-1.25, 1.05, 0.25),
        Vec3::new(-1.25, 0.8, -2.0),
        Vec3::Y,
        1.5,
        80.0,
    )?;
    render_linear(&inside, &scene, 480, 320, Vec3::new(0.15, 0.2, 0.3))?
        .display(0.0, ToneMap::Reinhard)?
        .save("output/inside-glass.png")?;
    println!("Saved output/glass.png and output/inside-glass.png");
    Ok(())
}
