use glam::{Vec2, Vec3};
use renderer_project::{
    integrator::{Whitted, dielectric, offset_origin, reflect},
    material::{Material, shade_linear},
    plane::Plane,
    ray::Ray,
    scene::{PointLight, Scene},
    shape::{Hit, Shape},
    sphere::Sphere,
};

fn close(a: Vec3, b: Vec3) {
    assert!((a - b).length() < 1e-4, "{a:?} != {b:?}");
}

#[test]
fn reflection_law_and_snell_relationship() {
    let angle = 30.0_f32.to_radians();
    let d = Vec3::new(angle.sin(), -angle.cos(), 0.0);
    close(
        reflect(d, Vec3::Y),
        Vec3::new(angle.sin(), angle.cos(), 0.0),
    );
    let (transmitted, f) = dielectric(d, Vec3::Y, 1.0, 1.5);
    let t = transmitted.unwrap();
    assert!((t.x - angle.sin() / 1.5).abs() < 1e-6);
    assert!((t.length() - 1.0).abs() < 1e-6);
    assert!((0.04..0.1).contains(&f));
    let (normal, f) = dielectric(-Vec3::Y, Vec3::Y, 1.0, 1.5);
    close(normal.unwrap(), -Vec3::Y);
    assert!((f - 0.04).abs() < 1e-6);
    let (same, f) = dielectric(d, Vec3::Y, 1.0, 1.0);
    close(same.unwrap(), d);
    assert_eq!(f, 0.0);
}

#[test]
fn critical_angle_and_tir_are_finite_and_consistent() {
    let critical = (1.0_f32 / 1.5).asin();
    for (delta, tir) in [(-1e-3, false), (1e-3, true)] {
        let angle = critical + delta;
        let d = Vec3::new(angle.sin(), -angle.cos(), 0.0);
        let (t, f) = dielectric(d, Vec3::Y, 1.5, 1.0);
        assert_eq!(t.is_none(), tir);
        if tir {
            assert_eq!(f, 1.0);
        } else {
            assert!(t.unwrap().is_finite());
        }
    }
    let (t, f) = dielectric(
        Vec3::new(critical.sin(), -critical.cos(), 0.0),
        Vec3::Y,
        1.5,
        1.0,
    );
    assert!(t.unwrap().y.abs() < 0.001);
    assert!(f > 0.99);
}

#[test]
fn offsets_choose_correct_side_and_do_not_self_hit_at_multiple_scales() {
    for scale in [0.001, 1.0, 1000.0] {
        let sphere = Sphere::new(Vec3::ZERO, scale, Material::glass(Vec3::ONE, 1.5));
        let hit = sphere
            .hit(
                &Ray::new(3.0 * scale * Vec3::Z, -Vec3::Z),
                0.0,
                f32::INFINITY,
            )
            .unwrap();
        let reflected = Ray::new(
            offset_origin(hit.point, hit.outward_normal, Vec3::Z),
            Vec3::Z,
        );
        assert!(sphere.hit(&reflected, 0.0, f32::INFINITY).is_none());
        let transmitted = Ray::new(
            offset_origin(hit.point, hit.outward_normal, -Vec3::Z),
            -Vec3::Z,
        );
        let exit = sphere.hit(&transmitted, 0.0, f32::INFINITY).unwrap();
        assert!(!exit.front_face);
        assert!((exit.t - 2.0 * scale).abs() < scale * 1e-4);
    }
}

#[test]
fn mirror_and_zero_local_glass_transmit_background() {
    let background = Vec3::new(0.3, 0.5, 0.8);
    let ray = Ray::new(3.0 * Vec3::Z, -Vec3::Z);
    for material in [Material::mirror(Vec3::ONE), Material::glass(Vec3::ONE, 1.5)] {
        let scene = Scene {
            shapes: vec![Box::new(Sphere::new(Vec3::ZERO, 1.0, material))],
            lights: vec![],
            textures: vec![],
        };
        let color = Whitted::new(16, 0.0)
            .unwrap()
            .trace(&ray, &scene, background);
        close(color, background);
        let inside = Whitted::new(16, 0.0).unwrap().trace(
            &Ray::new(Vec3::ZERO, Vec3::X),
            &scene,
            background,
        );
        if material.transmission.max_element() > 0.0 {
            close(inside, background);
        }
    }
}

#[test]
fn facing_mirrors_terminate_and_threshold_checks_every_color_channel() {
    let material = Material {
        diffuse: Vec3::X,
        reflection: Vec3::X,
        ..Material::default()
    };
    let scene = Scene {
        shapes: vec![
            Box::new(Plane::new(-Vec3::Y, Vec3::Y, material)),
            Box::new(Plane::new(Vec3::Y, -Vec3::Y, material)),
        ],
        lights: vec![],
        textures: vec![],
    };
    // Five shaded surfaces (primary plus four bounces), red remains significant.
    close(
        Whitted::new(4, 0.1)
            .unwrap()
            .trace(&Ray::new(Vec3::ZERO, Vec3::Y), &scene, Vec3::ZERO),
        Vec3::new(1.35, 0.0, 0.0),
    );
    assert!(Whitted::new(17, 0.0).is_err());
    assert!(Whitted::new(4, f32::NAN).is_err());
}

#[test]
fn educational_formula_is_additive_without_double_glass_reflection() {
    let material = Material {
        diffuse: Vec3::splat(0.2),
        reflection: Vec3::splat(0.3),
        transmission: Vec3::ZERO,
        ..Material::default()
    };
    let scene = Scene {
        shapes: vec![Box::new(Plane::new(Vec3::ZERO, Vec3::Y, material))],
        lights: vec![],
        textures: vec![],
    };
    let color = Whitted::default().trace(&Ray::new(Vec3::Y, -Vec3::Y), &scene, Vec3::ONE);
    close(color, Vec3::splat(0.2 * 0.27 + 0.3));
    assert_eq!(Material::glass(Vec3::ONE, 1.5).reflection, Vec3::ZERO);
}

#[test]
fn ambient_once_unclamped_rgb_and_zero_half_vector() {
    let material = Material {
        diffuse: Vec3::new(1.0, 0.5, 0.25),
        specular: Vec3::ZERO,
        ..Material::default()
    };
    let ray = Ray::new(Vec3::Y, -Vec3::Y);
    let hit = Hit::new(&ray, 1.0, Vec3::Y, material, Vec2::ZERO);
    let mut scene = Scene {
        shapes: vec![],
        lights: vec![
            PointLight {
                position: 2.0 * Vec3::Y,
                color: 2.0 * Vec3::ONE,
            },
            PointLight {
                position: 3.0 * Vec3::Y,
                color: Vec3::ONE,
            },
        ],
        textures: vec![],
    };
    close(shade_linear(&hit, &ray, &scene), 3.27 * material.diffuse);
    scene.lights = vec![PointLight {
        position: 2.0 * Vec3::Y,
        color: Vec3::ONE,
    }];
    let opposite = Ray::new(-Vec3::Y, Vec3::Y);
    assert!(shade_linear(&hit, &opposite, &scene).is_finite());
}

#[test]
fn shadow_endpoints_and_material_validation() {
    let material = Material::default();
    assert!(material.validate().is_ok());
    assert!(Material::glass(Vec3::ONE, 0.0).validate().is_err());
    let scene = Scene {
        shapes: vec![Box::new(Sphere::new(4.0 * Vec3::Y, 0.5, material))],
        lights: vec![],
        textures: vec![],
    };
    let ray = Ray::new(Vec3::ZERO, Vec3::Y);
    assert!(!scene.occluded(&ray, 0.0, 3.0));
    assert!(scene.occluded(&ray, 0.0, 5.0));
}
