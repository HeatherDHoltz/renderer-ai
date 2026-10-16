use camera::Camera;
use glam::Vec3;
use material::Material;
use plane::Plane;
use renderer_project::{camera, material, plane, render, scene, shape, sphere};
use scene::{PointLight, Scene};
use shape::Shape;
use sphere::Sphere;

fn main() {
    let width = 1024;
    let height = 768;
    let background = [25, 30, 40];
    let aspect = width as f32 / height as f32;
    let target = Vec3::new(0.0, 1.1, -0.5);

    let teal = Material {
        diffuse: Vec3::new(0.03, 0.48, 0.42),
        specular: Vec3::splat(0.8),
        shininess: 100.0,
        ..Default::default()
    };
    let coral = Material {
        diffuse: Vec3::new(0.8, 0.22, 0.12),
        specular: Vec3::ZERO,
        shininess: 8.0,
        ..Default::default()
    };
    let cream = Material {
        diffuse: Vec3::new(0.8, 0.72, 0.5),
        specular: Vec3::splat(0.25),
        shininess: 24.0,
        ..Default::default()
    };
    let navy = Material {
        diffuse: Vec3::new(0.09, 0.14, 0.28),
        specular: Vec3::splat(0.15),
        shininess: 12.0,
        ..Default::default()
    };
    let ground = Material {
        diffuse: Vec3::new(0.48, 0.48, 0.5),
        specular: Vec3::ZERO,
        shininess: 1.0,
        ..Default::default()
    };

    let wall = Material {
        diffuse: Vec3::new(0.3, 0.32, 0.38),
        specular: Vec3::ZERO,
        shininess: 1.0,
        ..Default::default()
    };

    let shapes: Vec<Box<dyn Shape>> = vec![
        Box::new(Sphere::new(Vec3::new(-0.9, 1.1, 0.4), 1.1, teal)),
        Box::new(Sphere::new(Vec3::new(0.7, 0.8, 1.0), 0.8, coral)),
        Box::new(Sphere::new(Vec3::new(2.1, 0.55, 0.3), 0.55, cream)),
        Box::new(Sphere::new(Vec3::new(0.6, 1.35, -1.6), 1.35, navy)),
        Box::new(Plane::new(Vec3::ZERO, Vec3::Y, ground)),
        Box::new(Plane::new(Vec3::new(0.0, 0.0, -3.8), Vec3::Z, wall)),
    ];

    let lights = vec![
        PointLight {
            position: Vec3::new(-3.5, 4.0, 5.0),
            color: Vec3::splat(1.15),
        },
        PointLight {
            position: Vec3::new(4.0, 3.0, 1.0),
            color: Vec3::new(0.8, 0.08, 0.5),
        },
    ];

    let scene1 = Scene {
        shapes,
        lights,
        textures: vec![],
    };
    let camera1 = Camera::new(Vec3::new(0.0, 4.0, 10.0), target, Vec3::Y, aspect, 45.0);
    let film = render::render(
        &camera1,
        &scene1,
        width,
        height,
        0.001,
        f32::INFINITY,
        background,
    );
    film.save("view1.png").unwrap();

    let orange = Material {
        diffuse: Vec3::new(0.85, 0.32, 0.06),
        specular: Vec3::splat(0.45),
        shininess: 24.0,
        ..Default::default()
    };
    let blue = Material {
        diffuse: Vec3::new(0.06, 0.3, 0.65),
        specular: Vec3::splat(0.7),
        shininess: 80.0,
        ..Default::default()
    };
    let yellow = Material {
        diffuse: Vec3::new(0.85, 0.65, 0.12),
        specular: Vec3::ZERO,
        shininess: 1.0,
        ..Default::default()
    };
    let pink = Material {
        diffuse: Vec3::new(0.65, 0.12, 0.25),
        specular: Vec3::ZERO,
        shininess: 1.0,
        ..Default::default()
    };
    let sand = Material {
        diffuse: Vec3::new(0.6, 0.5, 0.35),
        specular: Vec3::ZERO,
        shininess: 1.0,
        ..Default::default()
    };
    let shapes: Vec<Box<dyn Shape>> = vec![
        Box::new(Sphere::new(Vec3::new(-1.1, 0.25, -0.4), 1.65, orange)),
        Box::new(Sphere::new(Vec3::new(1.35, 0.9, -0.6), 0.9, blue)),
        Box::new(Sphere::new(Vec3::new(0.4, 0.5, 1.7), 0.5, yellow)),
        Box::new(Sphere::new(Vec3::new(-2.4, 0.6, 1.4), 0.6, pink)),
        Box::new(Plane::new(Vec3::ZERO, Vec3::Y, sand)),
    ];
    let lights = vec![
        PointLight {
            position: Vec3::new(-4.0, 5.0, 3.0),
            color: Vec3::new(0.95, 0.85, 0.7),
        },
        PointLight {
            position: Vec3::new(4.0, 4.0, -2.0),
            color: Vec3::new(0.25, 0.35, 0.55),
        },
    ];
    let scene2 = Scene {
        shapes,
        lights,
        textures: vec![],
    };
    let camera2 = Camera::new(
        Vec3::new(4.5, 7.0, 9.0),
        Vec3::new(-0.4, 0.1, 0.3),
        Vec3::Y,
        aspect,
        45.0,
    );
    let film = render::render(
        &camera2,
        &scene2,
        width,
        height,
        0.001,
        f32::INFINITY,
        [110, 140, 175],
    );
    film.save("view2.png").unwrap();

    let silver = Material {
        diffuse: Vec3::splat(0.22),
        specular: Vec3::new(0.95, 0.95, 1.0),
        shininess: 12.0,
        ..Default::default()
    };
    let copper = Material {
        diffuse: Vec3::new(0.38, 0.14, 0.07),
        specular: Vec3::new(1.0, 0.55, 0.32),
        shininess: 8.0,
        ..Default::default()
    };
    let gold = Material {
        diffuse: Vec3::new(0.38, 0.25, 0.04),
        specular: Vec3::new(1.0, 0.78, 0.22),
        shininess: 10.0,
        ..Default::default()
    };
    let bronze = Material {
        diffuse: Vec3::new(0.26, 0.13, 0.05),
        specular: Vec3::new(0.8, 0.46, 0.2),
        shininess: 20.0,
        ..Default::default()
    };
    let dark_ground = Material {
        diffuse: Vec3::new(0.15, 0.18, 0.23),
        specular: Vec3::ZERO,
        shininess: 1.0,
        ..Default::default()
    };
    let shapes: Vec<Box<dyn Shape>> = vec![
        Box::new(Sphere::new(Vec3::new(-1.35, 1.25, 0.0), 1.25, silver)),
        Box::new(Sphere::new(Vec3::new(0.5, 1.15, -0.5), 1.15, copper)),
        Box::new(Sphere::new(Vec3::new(2.1, 0.75, 0.1), 0.75, gold)),
        Box::new(Sphere::new(Vec3::new(-0.1, 0.5, 1.8), 0.5, bronze)),
        Box::new(Plane::new(Vec3::ZERO, Vec3::Y, dark_ground)),
        Box::new(Plane::new(Vec3::new(0.0, 0.0, -3.0), Vec3::Z, wall)),
    ];
    let lights = vec![
        PointLight {
            position: Vec3::new(-4.0, 3.5, 4.0),
            color: Vec3::splat(1.1),
        },
        PointLight {
            position: Vec3::new(4.0, 2.5, 2.0),
            color: Vec3::splat(0.8),
        },
    ];
    let scene3 = Scene {
        shapes,
        lights,
        textures: vec![],
    };
    let camera3 = Camera::new(
        Vec3::new(-3.0, 2.8, 11.0),
        Vec3::new(0.0, 1.1, 0.0),
        Vec3::Y,
        aspect,
        42.0,
    );
    let film = render::render(
        &camera3,
        &scene3,
        width,
        height,
        0.001,
        f32::INFINITY,
        background,
    );
    film.save("view3.png").unwrap();

    let shininess = [4.0, 16.0, 64.0, 256.0];
    let mut shapes: Vec<Box<dyn Shape>> = vec![];
    for (i, power) in shininess.iter().enumerate() {
        let material = Material {
            diffuse: Vec3::new(0.12, 0.38, 0.6),
            specular: Vec3::splat(0.65),
            shininess: *power,
            ..Default::default()
        };
        let position = Vec3::new(-3.3 + i as f32 * 2.2, 0.9, 0.0);
        shapes.push(Box::new(Sphere::new(position, 0.9, material)));
    }
    shapes.push(Box::new(Plane::new(Vec3::ZERO, Vec3::Y, ground)));
    let lights = vec![
        PointLight {
            position: Vec3::new(-8.0, 12.0, 12.0),
            color: Vec3::splat(0.85),
        },
        PointLight {
            position: Vec3::new(8.0, 8.0, 6.0),
            color: Vec3::splat(0.25),
        },
    ];
    let scene4 = Scene {
        shapes,
        lights,
        textures: vec![],
    };
    let camera4 = Camera::new(
        Vec3::new(0.0, 4.5, 13.0),
        Vec3::new(0.0, 0.65, 0.0),
        Vec3::Y,
        aspect,
        45.0,
    );
    let film = render::render(
        &camera4,
        &scene4,
        width,
        height,
        0.001,
        f32::INFINITY,
        background,
    );
    film.save("view4.png").unwrap();

    let matte_blue = Material {
        diffuse: Vec3::new(0.06, 0.35, 0.6),
        specular: Vec3::ZERO,
        shininess: 64.0,
        ..Default::default()
    };
    let mut glossy_blue = matte_blue;
    glossy_blue.specular = Vec3::splat(0.7);
    let matte_orange = Material {
        diffuse: Vec3::new(0.7, 0.25, 0.06),
        specular: Vec3::ZERO,
        shininess: 64.0,
        ..Default::default()
    };
    let mut glossy_orange = matte_orange;
    glossy_orange.specular = Vec3::splat(0.7);
    let shapes: Vec<Box<dyn Shape>> = vec![
        Box::new(Sphere::new(Vec3::new(-3.3, 0.9, 0.0), 0.9, matte_blue)),
        Box::new(Sphere::new(Vec3::new(-1.1, 0.9, 0.0), 0.9, glossy_blue)),
        Box::new(Sphere::new(Vec3::new(1.1, 0.9, 0.0), 0.9, matte_orange)),
        Box::new(Sphere::new(Vec3::new(3.3, 0.9, 0.0), 0.9, glossy_orange)),
        Box::new(Plane::new(Vec3::ZERO, Vec3::Y, dark_ground)),
    ];
    let lights = vec![
        PointLight {
            position: Vec3::new(-8.0, 12.0, 12.0),
            color: Vec3::splat(0.85),
        },
        PointLight {
            position: Vec3::new(8.0, 8.0, 6.0),
            color: Vec3::splat(0.25),
        },
    ];
    let scene5 = Scene {
        shapes,
        lights,
        textures: vec![],
    };
    let film = render::render(
        &camera4,
        &scene5,
        width,
        height,
        0.001,
        f32::INFINITY,
        background,
    );
    film.save("view5.png").unwrap();
}
