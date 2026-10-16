use glam::{Vec2, Vec3};
use renderer_project::{
    film::LinearFilm,
    light::RectLight,
    render::{render_range, render_sampled},
    sampling::{PixelSampling, SampleKey},
    scene_io::SceneFile,
};
use std::path::Path;

#[test]
fn sample_addresses_are_repeatable_bounded_and_decorrelated() {
    let mut means = [0.0_f64; 4];
    for sample in 0..32768 {
        let key = SampleKey::new(116, 23, sample);
        for dim in 0..4 {
            let value = key.value(dim);
            assert!((0.0..1.0).contains(&value));
            assert_eq!(value, SampleKey::new(116, 23, sample).value(dim));
            means[dim as usize] += value as f64;
        }
    }
    for sum in means {
        assert!((sum / 32768.0 - 0.5).abs() < 0.01);
    }
    let key = SampleKey::new(116, 23, 0);
    assert_ne!(key.value(2), key.value(3));
    assert_ne!(key.value(2), key.fork(1).value(2));
    assert_ne!(key.value(0), SampleKey::new(117, 23, 0).value(0));
    assert_eq!(key.pixel_offset(PixelSampling::Center), [0.5; 2]);
}

#[test]
fn uniform_rectangle_estimator_matches_analytic_irradiance() {
    let light = RectLight::new(
        2.0 * Vec3::Y,
        2.0 * Vec3::X,
        2.0 * Vec3::Z,
        Vec3::ONE,
        false,
    )
    .unwrap();
    let mut estimate = 0.0;
    let n = 65536;
    for i in 0..n {
        let key = SampleKey::new(116, 0, i);
        let sample = light
            .sample(Vec3::ZERO, Vec2::new(key.value(2), key.value(3)))
            .unwrap();
        estimate += sample.weight.x * sample.direction.y;
        assert!((sample.weight.x * sample.pdf_solid_angle - 1.0).abs() < 1e-5);
    }
    // Projected solid angle of a centered unit-half-width rectangle at height 2.
    let expected = 4.0 / 5.0_f32.sqrt() * (1.0 / 5.0_f32.sqrt()).atan();
    assert!(
        (estimate / n as f32 - expected).abs() < 0.005,
        "{} vs {}",
        estimate / n as f32,
        expected
    );
    assert!(light.sample(4.0 * Vec3::Y, Vec2::splat(0.5)).is_none());
    let both =
        RectLight::new(2.0 * Vec3::Y, 2.0 * Vec3::X, 2.0 * Vec3::Z, Vec3::ONE, true).unwrap();
    assert!(both.sample(4.0 * Vec3::Y, Vec2::splat(0.5)).is_some());
}

#[test]
fn emitter_area_distance_and_sidedness_have_expected_factors() {
    let light = RectLight::new(2.0 * Vec3::Y, Vec3::X, Vec3::Z, Vec3::ONE, false).unwrap();
    let big = RectLight::new(
        2.0 * Vec3::Y,
        2.0 * Vec3::X,
        2.0 * Vec3::Z,
        Vec3::ONE,
        false,
    )
    .unwrap();
    let a = light.sample(Vec3::ZERO, Vec2::splat(0.5)).unwrap();
    let b = big.sample(Vec3::ZERO, Vec2::splat(0.5)).unwrap();
    assert_eq!(big.area(), 4.0 * light.area());
    assert_eq!(b.weight, 4.0 * a.weight);
    let far = light.sample(-2.0 * Vec3::Y, Vec2::splat(0.5)).unwrap();
    assert_eq!(a.weight, 4.0 * far.weight);
    assert!(RectLight::new(Vec3::ZERO, Vec3::X, Vec3::X, Vec3::ONE, false).is_err());
}

#[test]
fn area_shadow_intervals_end_at_sampled_emitter() {
    use renderer_project::{
        material::{Material, shade_sampled},
        ray::Ray,
        scene::Scene,
        shape::Hit,
        sphere::Sphere,
    };
    let material = Material {
        diffuse: Vec3::splat(0.4),
        ..Material::default()
    };
    let ray = Ray::new(Vec3::Y, -Vec3::Y);
    let hit = Hit::new(&ray, 1.0, Vec3::Y, material, Vec2::ZERO);
    let key = SampleKey::new(116, 0, 0);
    let mut scene = Scene::default();
    scene.area_lights.push(
        RectLight::new(
            2.0 * Vec3::Y,
            0.2 * Vec3::X,
            0.2 * Vec3::Z,
            20.0 * Vec3::ONE,
            false,
        )
        .unwrap(),
    );
    let visible = shade_sampled(&hit, &ray, &scene, key);
    scene
        .shapes
        .push(Box::new(Sphere::new(4.0 * Vec3::Y, 0.5, material)));
    assert_eq!(visible, shade_sampled(&hit, &ray, &scene, key));
    scene.shapes[0] = Box::new(Sphere::new(Vec3::Y, 0.5, material));
    assert!((shade_sampled(&hit, &ray, &scene, key) - 0.27 * material.diffuse).length() < 1e-6);
}

#[test]
fn linear_normalization_and_batch_prefix_are_stable() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut file = SceneFile::load(&root.join("scenes/soft_shadows.json")).unwrap();
    file.render.width = 13;
    file.render.height = 9;
    file.render.spp = 13;
    let loaded = file.build(&root.join("scenes")).unwrap();
    let full = loaded.render().unwrap();
    let mut batched = LinearFilm::new(13, 9).unwrap();
    render_range(
        &loaded.camera,
        &loaded.scene,
        loaded.background,
        &loaded.render,
        &mut batched,
        0..5,
    )
    .unwrap();
    render_range(
        &loaded.camera,
        &loaded.scene,
        loaded.background,
        &loaded.render,
        &mut batched,
        5..13,
    )
    .unwrap();
    for y in 0..9 {
        for x in 0..13 {
            assert_eq!(full.pixel(x, y), batched.pixel(x, y));
            assert_eq!(full.sample_count(x, y), 13);
        }
    }
    assert!(
        render_range(
            &loaded.camera,
            &loaded.scene,
            loaded.background,
            &loaded.render,
            &mut batched,
            5..13
        )
        .is_err()
    );
    let empty = renderer_project::scene::Scene::default();
    let background = Vec3::new(4.0, 2.0, 1.0);
    let film = render_sampled(&loaded.camera, &empty, background, &loaded.render).unwrap();
    for y in 0..9 {
        for x in 0..13 {
            assert_eq!(film.pixel(x, y), background);
        }
    }
}

#[test]
fn repeated_seed_reproduces_lighting_and_reverse_pixel_order() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut file = SceneFile::load(&root.join("scenes/soft_shadows.json")).unwrap();
    file.render.width = 9;
    file.render.height = 7;
    file.render.spp = 7;
    let loaded = file.build(&root.join("scenes")).unwrap();
    let forward = loaded.render().unwrap();
    let repeat = loaded.render().unwrap();
    let mut reverse = LinearFilm::new(9, 7).unwrap();
    let integrator = loaded.render.whitted().unwrap();
    for y in (0..7).rev() {
        for x in (0..9).rev() {
            for s in 0..7 {
                let key = SampleKey::new(loaded.render.seed, y as u64 * 9 + x as u64, s);
                let [dx, dy] = key.pixel_offset(loaded.render.sampling);
                let ray = loaded
                    .camera
                    .ray((x as f32 + dx) / 9.0, 1.0 - (y as f32 + dy) / 7.0);
                reverse
                    .add_sample(
                        x,
                        y,
                        integrator.trace_sampled(&ray, &loaded.scene, loaded.background, key),
                    )
                    .unwrap();
            }
        }
    }
    for y in 0..7 {
        for x in 0..9 {
            assert_eq!(forward.pixel(x, y), repeat.pixel(x, y));
            assert_eq!(forward.pixel(x, y), reverse.pixel(x, y));
        }
    }
}
