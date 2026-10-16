use glam::{Mat4, Quat, Vec3};
use renderer_project::{
    environment::Environment,
    geometry::{Instance, Primitive},
    material::Material,
    pbr::{PhysicalMaterial, beer_transmittance},
    physical::PhysicalIntegrator,
    ray::Ray,
    sampling::SampleKey,
    scene::Scene,
};

fn slab(thickness: f32, ior: f32, absorption: Vec3) -> Scene {
    let mut scene = Scene {
        environment: Some(Environment::new(1, 1, vec![Vec3::ONE], 1.0, 0.0).unwrap()),
        ..Scene::default()
    };
    scene.shapes.push(Box::new(
        Instance::new(
            Primitive::Box,
            Mat4::from_scale(Vec3::new(10.0, 10.0, thickness * 0.5)),
            Material {
                physical: Some(PhysicalMaterial::Gemstone {
                    absorption: absorption.to_array(),
                    ior,
                }),
                ..Material::default()
            },
        )
        .unwrap(),
    ));
    scene
}
fn trace(scene: &Scene, origin: Vec3, direction: Vec3) -> Vec3 {
    PhysicalIntegrator::new(16, 0.0).unwrap().trace_sampled(
        &Ray::new(origin, direction),
        scene,
        Vec3::ZERO,
        SampleKey::default(),
    )
}
#[test]
fn beer_absorption_tracks_actual_world_distance_thickness_and_inside_origins() {
    let sigma = Vec3::new(0.2, 0.7, 1.3);
    for thickness in [0.5, 1.0, 2.0] {
        let color = trace(
            &slab(thickness, 1.0, sigma),
            Vec3::new(0.0, 0.0, 4.0),
            -2.0 * Vec3::Z,
        );
        assert!(
            (color - beer_transmittance(sigma, thickness))
                .abs()
                .max_element()
                < 8e-5,
            "{color:?}"
        );
    }
    let color = trace(&slab(2.0, 1.0, sigma), Vec3::ZERO, -3.0 * Vec3::Z);
    assert!((color - beer_transmittance(sigma, 1.0)).abs().max_element() < 8e-5);
    assert_eq!(
        beer_transmittance(Vec3::new(0.0, 1.0, 2.0), f32::INFINITY),
        Vec3::X
    );
}
#[test]
fn absorption_preserves_entry_reflection_and_accumulates_internal_reflection_distance() {
    let sigma = Vec3::new(0.0, 0.4, 1.0);
    let transmitted = beer_transmittance(sigma, 1.0);
    let expected = Vec3::splat(0.04) + 0.96 * 0.96 * transmitted / (Vec3::ONE - 0.04 * transmitted);
    let actual = trace(&slab(1.0, 1.5, sigma), Vec3::new(0.0, 0.0, 3.0), -Vec3::Z);
    assert!(
        (actual - expected).abs().max_element() < 1e-4,
        "{actual:?} vs {expected:?}"
    );
    let actual = trace(
        &slab(1.0, 1.5, Vec3::splat(1000.0)),
        Vec3::new(0.0, 0.0, 3.0),
        -Vec3::Z,
    );
    assert!((actual - Vec3::splat(0.04)).length() < 1e-6);
}
fn fiber(along: f32, across: f32) -> PhysicalMaterial {
    PhysicalMaterial::Chatoyant {
        base_color: [0.3, 0.12, 0.025],
        fiber_direction: [1.0, 0.0, 0.0],
        roughness_along: along,
        roughness_across: across,
    }
}
#[test]
fn anisotropic_model_matches_isotropic_limit_is_reciprocal_and_rotates_with_fibers() {
    let n = Vec3::Y;
    let wo = Vec3::new(0.2, 1.0, 0.1).normalize();
    let wi = Vec3::new(-0.1, 1.0, 0.4).normalize();
    let isotropic = PhysicalMaterial::MetalRough {
        base_color: [0.3, 0.12, 0.025],
        metallic: 0.0,
        roughness: 0.6,
    };
    assert!((fiber(0.6, 0.6).eval(n, wo, wi) - isotropic.eval(n, wo, wi)).length() < 1e-5);
    assert!((fiber(0.6, 0.6).pdf(n, wo, wi) - isotropic.pdf(n, wo, wi)).abs() < 1e-5);
    let material = fiber(0.18, 0.65);
    let value = material.eval(n, wo, wi);
    assert!((value - material.eval(n, wi, wo)).length() < 1e-5);
    let rotation = Quat::from_rotation_z(0.4) * Quat::from_rotation_y(0.6);
    let rotated = PhysicalMaterial::Chatoyant {
        base_color: [0.3, 0.12, 0.025],
        fiber_direction: (rotation * Vec3::X).to_array(),
        roughness_along: 0.18,
        roughness_across: 0.65,
    };
    assert!((value - rotated.eval(rotation * n, rotation * wo, rotation * wi)).length() < 1e-5);
    let a = material.eval(n, n, Vec3::new(0.25, 1.0, 0.0).normalize());
    let b = material.eval(n, n, Vec3::new(0.0, 1.0, 0.25).normalize());
    assert!(
        b.max_element() > a.max_element() * 1.5,
        "anisotropy lost: {a:?} {b:?}"
    );
}
#[test]
fn anisotropic_sampling_is_finite_with_consistent_pdf_and_plausible_energy() {
    let material = fiber(0.22, 0.7);
    let mut energy = Vec3::ZERO;
    for i in 0..32768 {
        let key = SampleKey::new(116, 0, i);
        if let Some(sample) =
            material.sample(Vec3::Y, Vec3::Y, [key.value(0), key.value(1), key.value(2)])
        {
            assert!(sample.value.is_finite() && sample.value.min_element() >= 0.0);
            assert!((sample.direction.length() - 1.0).abs() < 1e-5);
            assert_eq!(sample.pdf, material.pdf(Vec3::Y, Vec3::Y, sample.direction));
            energy += sample.value * sample.direction.y / sample.pdf;
        }
    }
    energy /= 32768.0;
    assert!(
        energy.max_element() < 1.02 && energy.min_element() > 0.01,
        "{energy:?}"
    );
    // The fallback frame remains finite when the fiber is parallel to the normal.
    assert!(material.eval(Vec3::X, Vec3::X, Vec3::X).is_finite());
}
#[test]
fn gem_and_fiber_parameter_validation_rejects_nonphysical_inputs() {
    for m in [
        PhysicalMaterial::Gemstone {
            absorption: [-1.0, 0.0, 0.0],
            ior: 1.5,
        },
        PhysicalMaterial::Gemstone {
            absorption: [f32::INFINITY, 0.0, 0.0],
            ior: 1.5,
        },
        PhysicalMaterial::Gemstone {
            absorption: [0.0; 3],
            ior: 0.9,
        },
        PhysicalMaterial::Chatoyant {
            base_color: [0.3; 3],
            fiber_direction: [0.0; 3],
            roughness_along: 0.2,
            roughness_across: 0.6,
        },
        fiber(0.0, 0.6),
        fiber(0.2, 1.1),
    ] {
        assert!(m.validate().is_err());
    }
}

#[test]
fn faceted_gem_edge_rays_remain_finite_across_backends() {
    use renderer_project::{accel::AccelKind, scene_io::SceneFile};
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    for (name, width, x, y, sample) in [
        ("diamond", 384u32, 191u32, 275u32, 25u32),
        ("ruby", 448, 173, 73, 5),
        ("sapphire", 448, 298, 170, 14),
    ] {
        let mut file = SceneFile::load(&root.join(format!("scenes/gem_{name}.json"))).unwrap();
        file.render.width = width;
        file.render.height = width;
        let key = SampleKey::new(116, u64::from(y) * u64::from(width) + u64::from(x), sample);
        let [dx, dy] = key.pixel_offset(file.render.sampling);
        for backend in [AccelKind::None, AccelKind::Bvh, AccelKind::Octree] {
            file.render.accel = backend;
            let loaded = file.build(&root.join("scenes")).unwrap();
            let ray = loaded.camera.ray(
                (x as f32 + dx) / width as f32,
                1.0 - (y as f32 + dy) / width as f32,
            );
            let color = file.render.renderer().unwrap().trace_sampled(
                &ray,
                &loaded.scene,
                loaded.background,
                key,
            );
            assert!(
                color.is_finite() && color.min_element() >= 0.0,
                "{name} {backend:?}: {color:?}"
            );
        }
    }
    let mut file = SceneFile::load(&root.join("scenes/gem_diamond.json")).unwrap();
    // Homogeneous absorption has no meaningful surface-color texture slot.
    file.materials.get_mut("gem").unwrap().texture = Some("checker".into());
    file.textures.insert(
        "checker".into(),
        renderer_project::scene_io::TextureDef::Checker {
            a: [1.0; 3],
            b: [0.0; 3],
            scale: [1.0; 2],
        },
    );
    assert!(
        file.build(&root.join("scenes"))
            .err()
            .unwrap()
            .contains("homogeneous")
    );
}

#[test]
fn absorbing_meshes_require_closed_outward_faces_and_a_common_interior_kernel() {
    use renderer_project::{mesh::Mesh, scene_io::SceneFile};
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    for file in [
        "zsky-jewel-01.obj",
        "zsky-jewel-02.obj",
        "zsky-jewel-03.obj",
        "zsky-jewel-04.obj",
        "emerald-step.obj",
    ] {
        Mesh::load(&root.join("assets/gems").join(file))
            .unwrap()
            .validate_absorbing_solid()
            .unwrap();
    }
    let mut mesh = Mesh::load(&root.join("assets/gems/zsky-jewel-01.obj")).unwrap();
    mesh.triangles.pop();
    assert!(mesh.validate_absorbing_solid().is_err());
    let mut mesh = Mesh::load(&root.join("assets/gems/zsky-jewel-01.obj")).unwrap();
    for face in &mut mesh.triangles {
        face.swap(1, 2);
    }
    assert!(mesh.validate_absorbing_solid().is_err());
    let mut file = SceneFile::load(&root.join("scenes/gem_diamond.json")).unwrap();
    file.geometries
        .insert("gem".into(), renderer_project::scene_io::GeometryDef::Plane);
    assert!(
        file.build(&root.join("scenes"))
            .err()
            .unwrap()
            .contains("finite closed")
    );
}
