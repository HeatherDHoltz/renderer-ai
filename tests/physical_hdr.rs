use glam::Vec3;
use renderer_project::{
    environment::Environment,
    film::LinearFilm,
    material::Material,
    pbr::{PhysicalMaterial, dielectric_interface},
    physical::PhysicalIntegrator,
    plane::Plane,
    ray::Ray,
    sampling::SampleKey,
    scene::Scene,
};
use std::f32::consts::PI;

#[test]
fn environment_pdf_normalization_poles_rotation_and_black_fallback() {
    for radiance in [Vec3::ZERO, Vec3::splat(4.0)] {
        let env = Environment::new(8, 4, vec![radiance; 32], 1.0, 0.0).unwrap();
        let mut integral = 0.0;
        for y in 0..4 {
            for x in 0..8 {
                let theta = PI * (y as f32 + 0.5) / 4.0;
                let phi = 2.0 * PI * (x as f32 + 0.5) / 8.0;
                let d = Vec3::new(
                    theta.sin() * phi.cos(),
                    theta.cos(),
                    theta.sin() * phi.sin(),
                );
                integral += env.pdf(d) as f64 * env.texel_solid_angle(y);
            }
        }
        assert!((integral - 1.0).abs() < 1e-6);
        for d in [Vec3::Y, -Vec3::Y, Vec3::X, -Vec3::Z] {
            assert!((env.pdf(d) - 1.0 / (4.0 * PI)).abs() < 1e-6);
            assert_eq!(env.eval(d), radiance);
        }
        let sample = env.sample([0.0; 3]);
        assert!(sample.direction.is_finite() && sample.pdf.is_finite());
        assert_eq!(sample.radiance, radiance);
    }
    let pixels: Vec<_> = (0..32)
        .map(|i| {
            if i % 8 == 0 || i % 8 == 7 {
                Vec3::X
            } else {
                Vec3::Z
            }
        })
        .collect();
    let env = Environment::new(8, 4, pixels.clone(), 1.0, 0.0).unwrap();
    let rotated = Environment::new(8, 4, pixels, 1.0, 90.0).unwrap();
    assert_eq!(env.eval(Vec3::X), Vec3::X);
    assert_eq!(rotated.eval(Vec3::Z), Vec3::X);
    assert_eq!(
        env.eval(Vec3::new(1.0, 0.0, 1e-6)),
        env.eval(Vec3::new(1.0, 0.0, -1e-6))
    );
}

#[test]
fn bright_hdr_texel_is_importance_sampled_with_consistent_pdf() {
    let mut pixels = vec![Vec3::splat(0.1); 128];
    pixels[3 * 16 + 4] = Vec3::splat(30.0);
    let env = Environment::new(16, 8, pixels, 1.0, 37.0).unwrap();
    let area = env.texel_solid_angle(3);
    let expected = 30.0 * area / (0.1 * (4.0 * std::f64::consts::PI - area) + 30.0 * area);
    let mut bright = 0;
    for i in 0..32768 {
        let key = SampleKey::new(116, 0, i);
        let sample = env.sample([key.value(0), key.value(1), key.value(2)]);
        if sample.radiance.x > 20.0 {
            bright += 1;
        }
        assert!((sample.pdf - env.pdf(sample.direction)).abs() < 1e-4 * sample.pdf.max(1.0));
    }
    assert!((bright as f64 / 32768.0 - expected).abs() < 0.01);
}

#[test]
fn diffuse_environment_illuminates_an_unlit_surface_without_double_counting() {
    let base = Vec3::new(0.2, 0.4, 0.6);
    let le = Vec3::new(2.0, 1.0, 0.5);
    let mut scene = Scene {
        environment: Some(Environment::new(1, 1, vec![le], 1.0, 0.0).unwrap()),
        ..Scene::default()
    };
    scene.shapes.push(Box::new(Plane::new(
        Vec3::ZERO,
        Vec3::Y,
        Material {
            physical: Some(PhysicalMaterial::Diffuse {
                base_color: base.to_array(),
            }),
            ..Material::default()
        },
    )));
    let integrator = PhysicalIntegrator::new(8, 1e-4).unwrap();
    let ray = Ray::new(Vec3::Y, -Vec3::Y);
    let mut sum = Vec3::ZERO;
    for sample in 0..16384 {
        sum += integrator.trace_sampled(&ray, &scene, Vec3::ZERO, SampleKey::new(116, 0, sample));
    }
    assert!(
        (sum / 16384.0 - base * le).length() < 0.006,
        "{:?}",
        sum / 16384.0
    );
}

#[test]
fn brdfs_are_finite_reciprocal_and_plausibly_energy_bounded() {
    let materials = [
        PhysicalMaterial::Diffuse {
            base_color: [0.7, 0.4, 0.2],
        },
        PhysicalMaterial::MetalRough {
            base_color: [0.8, 0.5, 0.2],
            metallic: 0.0,
            roughness: 0.5,
        },
        PhysicalMaterial::MetalRough {
            base_color: [0.8, 0.5, 0.2],
            metallic: 1.0,
            roughness: 0.65,
        },
    ];
    let wo = Vec3::new(0.4, 1.0, 0.2).normalize();
    let wi = Vec3::new(-0.3, 1.0, 0.6).normalize();
    for material in materials {
        let a = material.eval(Vec3::Y, wo, wi);
        let b = material.eval(Vec3::Y, wi, wo);
        assert!(a.is_finite() && a.min_element() >= 0.0);
        assert!((a - b).length() < 1e-5);
        let mut energy = Vec3::ZERO;
        for i in 0..32768 {
            let key = SampleKey::new(116, 1, i);
            let u = key.value(0);
            let phi = 2.0 * PI * key.value(1);
            let r = u.sqrt();
            let direction = Vec3::new(r * phi.cos(), (1.0 - u).sqrt(), r * phi.sin());
            energy += material.eval(Vec3::Y, Vec3::Y, direction) * PI;
        }
        let energy = energy / 32768.0;
        assert!(
            energy.max_element() <= 1.02 && energy.min_element() >= 0.0,
            "{energy:?}"
        );
    }
    let diffuse = PhysicalMaterial::Diffuse {
        base_color: [0.3; 3],
    };
    assert!((diffuse.eval(Vec3::Y, Vec3::Y, Vec3::Y) - Vec3::splat(0.3 / PI)).length() < 1e-6);
    let metal = PhysicalMaterial::MetalRough {
        base_color: [0.0; 3],
        metallic: 1.0,
        roughness: 0.5,
    };
    assert_eq!(metal.eval(Vec3::Y, Vec3::Y, Vec3::Y), Vec3::ZERO);
}

#[test]
fn ggx_pdf_accounts_for_rejected_below_surface_samples() {
    let material = PhysicalMaterial::MetalRough {
        base_color: [1.0; 3],
        metallic: 1.0,
        roughness: 1.0,
    };
    let mut accepted = 0;
    for i in 0..32768 {
        let key = SampleKey::new(116, 3, i);
        if let Some(sample) =
            material.sample(Vec3::Y, Vec3::Y, [key.value(0), key.value(1), key.value(2)])
        {
            accepted += 1;
            assert!((sample.pdf - 1.0 / (4.0 * PI)).abs() < 1e-6);
            assert!(sample.value.is_finite());
        }
    }
    // For alpha=1 at normal view the reflected upper hemisphere has half the NDF mass.
    assert!((accepted as f32 / 32768.0 - 0.5).abs() < 0.01);
}

#[test]
fn dielectric_fresnel_tir_eta_scale_and_uniform_glass_slab() {
    let (t, f, enter) = dielectric_interface(-Vec3::Z, Vec3::Z, 1.0, 1.5);
    assert_eq!(t.unwrap(), -Vec3::Z);
    assert!((f - 0.04).abs() < 1e-6);
    let (_, _, exit) = dielectric_interface(-Vec3::Z, Vec3::Z, 1.5, 1.0);
    assert!((enter * exit - 1.0).abs() < 1e-6);
    let angle = 50.0_f32.to_radians();
    let (t, f, _) =
        dielectric_interface(Vec3::new(angle.sin(), 0.0, -angle.cos()), Vec3::Z, 1.5, 1.0);
    assert!(t.is_none());
    assert_eq!(f, 1.0);
    for tint in [Vec3::ONE, Vec3::new(0.8, 0.9, 1.0)] {
        let mut scene = Scene {
            environment: Some(Environment::new(1, 1, vec![Vec3::ONE], 1.0, 0.0).unwrap()),
            ..Scene::default()
        };
        let material = Material {
            physical: Some(PhysicalMaterial::Dielectric {
                tint: tint.to_array(),
                ior: 1.5,
            }),
            ..Material::default()
        };
        scene
            .shapes
            .push(Box::new(Plane::new(Vec3::ZERO, Vec3::Z, material)));
        scene
            .shapes
            .push(Box::new(Plane::new(-Vec3::Z, -Vec3::Z, material)));
        let color = PhysicalIntegrator::new(16, 0.0).unwrap().trace_sampled(
            &Ray::new(Vec3::Z, -Vec3::Z),
            &scene,
            Vec3::ZERO,
            SampleKey::default(),
        );
        assert!(
            (color - (Vec3::splat(0.04) + 0.96 * tint * tint)).length() < 1e-5,
            "{color:?}"
        );
    }
}

#[test]
fn hdr_export_preserves_linear_values_above_one() {
    let path = std::env::temp_dir().join(format!("renderer-hdr-{}.hdr", std::process::id()));
    let mut film = LinearFilm::new(2, 1).unwrap();
    let colors = [Vec3::new(8.0, 0.5, 2.0), Vec3::new(1.0, 16.0, 4.0)];
    for (x, c) in colors.iter().enumerate() {
        film.add_sample(x as u32, 0, *c).unwrap();
    }
    film.save_hdr(&path).unwrap();
    let decoder = image::codecs::hdr::HdrDecoder::new(std::io::BufReader::new(
        std::fs::File::open(&path).unwrap(),
    ))
    .unwrap();
    let pixels = decoder.read_image_hdr().unwrap();
    for (a, b) in pixels.iter().zip(colors) {
        assert!((Vec3::from_array(a.0) - b).abs().max_element() < 0.07);
    }
    let env = Environment::load(&path, 1.0, 0.0).unwrap();
    assert!(env.eval(Vec3::X).max_element() > 1.0);
    std::fs::remove_file(path).unwrap();
}
