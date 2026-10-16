use glam::{Mat4, Vec3};
use renderer_project::{
    accel::{Aabb, AccelKind, Acceleration, TraceStats},
    geometry::{Instance, Primitive},
    material::Material,
    plane::Plane,
    ray::Ray,
    scene::Scene,
    scene_io::{GeometryDef, ObjectDef, SceneFile},
    shape::Hit,
    sphere::Sphere,
};
use std::path::Path;

#[test]
fn mesh_vertices_edges_and_finite_endpoints_survive_acceleration() {
    use renderer_project::{
        mesh::{Mesh, MeshInstance},
        shape::Shape,
    };
    use std::sync::Arc;
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let source = std::fs::read_to_string(root.join("assets/uv-sphere.obj")).unwrap();
    let reference = Mesh::parse(&source).unwrap();
    let mut points = reference.positions.clone();
    for triangle in &reference.triangles {
        let p = triangle.map(|c| reference.positions[c.position]);
        points.push((p[0] + p[1]) * 0.5);
    }
    let instances: Vec<_> = [AccelKind::None, AccelKind::Bvh, AccelKind::Octree]
        .into_iter()
        .map(|kind| {
            let mut mesh = Mesh::parse(&source).unwrap();
            mesh.build_accel(kind).unwrap();
            MeshInstance::new(Arc::new(mesh), Mat4::IDENTITY, Material::default(), false).unwrap()
        })
        .collect();
    for point in points {
        let direction = -point.normalize();
        let ray = Ray::new(point - 2.0 * direction, direction);
        for max in [2.0, 2.0001, 100.0] {
            for instance in &instances[1..] {
                compare(
                    instances[0].hit(&ray, 0.0, max),
                    instance.hit(&ray, 0.0, max),
                );
                assert_eq!(
                    instances[0].occluded(&ray, 0.0, max),
                    instance.occluded(&ray, 0.0, max)
                );
            }
        }
    }
}

fn random(seed: &mut u64) -> f32 {
    *seed = seed.wrapping_add(0x9e3779b97f4a7c15);
    let mut x = *seed;
    x = (x ^ (x >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94d049bb133111eb);
    ((x ^ (x >> 31)) >> 40) as f32 / 16_777_216.0
}
fn compare(a: Option<Hit>, b: Option<Hit>) {
    match (a, b) {
        (None, None) => {}
        (Some(a), Some(b)) => {
            assert!((a.t - b.t).abs() < 1e-5 * a.t.abs().max(1.0));
            assert_eq!(a.object_id, b.object_id);
            assert_eq!(a.primitive_id, b.primitive_id);
            assert_eq!(a.front_face, b.front_face);
            assert!((a.normal - b.normal).length() < 1e-4);
        }
        _ => panic!("accelerated hit/miss differs"),
    }
}

#[test]
fn slab_zero_components_inside_negative_direction_and_thin_bounds() {
    let b = Aabb::new(-Vec3::ONE, Vec3::ONE).unwrap();
    assert_eq!(
        b.interval(&Ray::new(3.0 * Vec3::Z, -Vec3::Z), 0.0, 10.0),
        Some((2.0, 4.0))
    );
    assert_eq!(
        b.interval(&Ray::new(Vec3::ZERO, Vec3::X), 0.0, 10.0),
        Some((0.0, 1.0))
    );
    assert!(
        b.interval(&Ray::new(Vec3::new(2.0, 0.0, 3.0), -Vec3::Z), 0.0, 10.0)
            .is_none()
    );
    assert!(
        b.interval(&Ray::new(3.0 * Vec3::Z, -Vec3::Z), 0.0, 1.0)
            .is_none()
    );
    assert!(
        b.interval(&Ray::new(Vec3::ZERO, Vec3::ZERO), 0.0, 10.0)
            .is_none()
    );
    let thin = Aabb::new(Vec3::ZERO, Vec3::new(1.0, 1.0, 0.0)).unwrap();
    assert_eq!(
        thin.interval(&Ray::new(Vec3::new(0.5, 0.5, 2.0), -Vec3::Z), 0.0, 10.0),
        Some((2.0, 2.0))
    );
    assert!(Aabb::new(Vec3::ONE, -Vec3::ONE).is_err());
    let transformed =
        b.transform(Mat4::from_rotation_y(0.7) * Mat4::from_scale(Vec3::new(-2.0, 0.5, 3.0)));
    for p in [-Vec3::ONE, Vec3::ONE] {
        let p = (Mat4::from_rotation_y(0.7) * Mat4::from_scale(Vec3::new(-2.0, 0.5, 3.0)))
            .transform_point3(p);
        assert!(p.cmpge(transformed.min).all() && p.cmple(transformed.max).all());
    }
}

#[test]
fn seeded_scene_and_mesh_queries_agree_with_brute_force() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut file = SceneFile::load(&root.join("scenes/mesh.json")).unwrap();
    file.geometries.insert("sphere".into(), GeometryDef::Sphere);
    file.geometries.insert("box".into(), GeometryDef::Box);
    file.geometries
        .insert("cylinder".into(), GeometryDef::Cylinder);
    file.geometries.insert("cone".into(), GeometryDef::Cone);
    let mut seed = 116;
    for i in 0..40 {
        let mut object = ObjectDef {
            name: format!("random-{i}"),
            geometry: Some(["sphere", "box", "cylinder", "cone"][i % 4].into()),
            material: Some("mesh".into()),
            ..ObjectDef::default()
        };
        object.transform.translation = [
            (random(&mut seed) - 0.5) * 15.0,
            random(&mut seed) * 6.0,
            (random(&mut seed) - 0.5) * 15.0,
        ];
        object.transform.scale = [
            if i % 3 == 0 { -0.6 } else { 0.6 },
            0.3 + random(&mut seed),
            0.5,
        ];
        object.transform.rotation_degrees = [20.0, random(&mut seed) * 180.0, -12.0];
        file.objects.push(object);
    }
    let scenes: Vec<_> = [AccelKind::None, AccelKind::Bvh, AccelKind::Octree]
        .into_iter()
        .map(|kind| {
            file.render.accel = kind;
            file.build(&root.join("scenes")).unwrap()
        })
        .collect();
    for i in 0..4000 {
        let origin = Vec3::new(
            (random(&mut seed) - 0.5) * 25.0,
            (random(&mut seed) - 0.2) * 12.0,
            (random(&mut seed) - 0.5) * 25.0,
        );
        let mut direction = Vec3::new(
            random(&mut seed) - 0.5,
            random(&mut seed) - 0.5,
            random(&mut seed) - 0.5,
        );
        if i % 4 == 0 {
            direction[i % 3] = 0.0;
        }
        let ray = Ray::new(origin, direction);
        let max = if i % 2 == 0 { 5.0 } else { 1000.0 };
        for accelerated in &scenes[1..] {
            compare(
                scenes[0].scene.nearest_hit(&ray, 0.0001, max),
                accelerated.scene.nearest_hit(&ray, 0.0001, max),
            );
            assert_eq!(
                scenes[0].scene.occluded(&ray, 0.0001, max),
                accelerated.scene.occluded(&ray, 0.0001, max)
            );
        }
    }
    for accelerated in &scenes[1..] {
        // A plane far outside every finite tree still participates.
        let ray = Ray::new(Vec3::new(10000.0, 2.0, 10000.0), -Vec3::Y);
        compare(
            scenes[0].scene.nearest_hit(&ray, 0.0, 10.0),
            accelerated.scene.nearest_hit(&ray, 0.0, 10.0),
        );
    }
}

fn straddler_scene(kind: AccelKind) -> Scene {
    let mut scene = Scene::default();
    scene.shapes.push(Box::new(
        Instance::new(
            Primitive::Box,
            Mat4::from_scale(Vec3::splat(20.0)),
            Material::default(),
        )
        .unwrap(),
    ));
    scene.shapes.push(Box::new(Plane::new(
        -30.0 * Vec3::Y,
        Vec3::Y,
        Material::default(),
    )));
    for i in 0..80 {
        scene.shapes.push(Box::new(Sphere::new(
            Vec3::new((i % 8) as f32 - 4.0, (i / 8) as f32 - 5.0, 0.0),
            0.2,
            Material::default(),
        )));
    }
    scene.build_accel(kind).unwrap();
    scene
}

#[test]
fn octree_parent_straddlers_and_exact_hit_ties_remain_visible() {
    let brute = straddler_scene(AccelKind::None);
    for kind in [AccelKind::Bvh, AccelKind::Octree] {
        let accelerated = straddler_scene(kind);
        for x in -10..10 {
            let ray = Ray::new(Vec3::new(x as f32, 0.0, 5.0), -Vec3::Z);
            compare(
                brute.nearest_hit(&ray, 0.0, 100.0),
                accelerated.nearest_hit(&ray, 0.0, 100.0),
            );
        }
        let mut scene = Scene::default();
        for _ in 0..100 {
            scene
                .shapes
                .push(Box::new(Sphere::new(Vec3::ZERO, 1.0, Material::default())));
        }
        scene.build_accel(kind).unwrap();
        let ray = Ray::new(3.0 * Vec3::Z, -Vec3::Z);
        assert_eq!(scene.nearest_hit(&ray, 0.0, 100.0).unwrap().object_id, 0);
        assert!(scene.occluded(&ray, 0.0, 100.0));
    }
    let empty = Acceleration::build(AccelKind::Bvh, &[]).unwrap();
    assert_eq!(empty.node_count(), 0);
}

#[test]
fn measured_queries_match_normal_queries_and_reduce_primitive_work() {
    let brute = straddler_scene(AccelKind::None);
    let bvh = straddler_scene(AccelKind::Bvh);
    let mut a = TraceStats::default();
    let mut b = TraceStats::default();
    for i in 0..100 {
        let ray = Ray::new(Vec3::new(i as f32 * 0.1 - 5.0, 0.0, 5.0), -Vec3::Z);
        compare(
            bvh.nearest_hit(&ray, 0.0, 100.0),
            bvh.nearest_hit_with_stats(&ray, 0.0, 100.0, &mut b),
        );
        brute.nearest_hit_with_stats(&ray, 0.0, 100.0, &mut a);
        assert_eq!(
            bvh.occluded(&ray, 0.0, 100.0),
            bvh.occluded_with_stats(&ray, 0.0, 100.0, &mut TraceStats::default())
        );
    }
    assert!(b.primitive_tests < a.primitive_tests);
    assert!(b.node_visits > 0);
}
