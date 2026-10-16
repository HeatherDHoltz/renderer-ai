use glam::{Mat4, Vec2, Vec3};
use renderer_project::{
    material::Material,
    mesh::{Mesh, MeshInstance},
    ray::Ray,
    scene_io::SceneFile,
    shape::Shape,
    texture::{Filter, Texture, Wrap, srgb_to_linear},
};
use std::{path::Path, sync::Arc};

const TRIANGLE: &str = "v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nvn 0 0 1\nvn 0 1 1\nvn 1 0 1\nf -3/2/3 -2/3/1 -1/1/2\n";
fn close(a: Vec3, b: Vec3) {
    assert!((a - b).length() < 1e-4, "{a:?} != {b:?}");
}

#[test]
fn independent_obj_indices_barycentrics_and_smooth_normals() {
    let mesh = Arc::new(Mesh::parse(TRIANGLE).unwrap());
    assert_eq!(mesh.positions.len(), 3);
    let flat = MeshInstance::new(mesh.clone(), Mat4::IDENTITY, Material::default(), false).unwrap();
    let smooth = MeshInstance::new(mesh, Mat4::IDENTITY, Material::default(), true).unwrap();
    let ray = Ray::new(Vec3::new(0.25, 0.25, 2.0), -2.0 * Vec3::Z);
    let a = flat.hit(&ray, 0.0, 10.0).unwrap();
    let b = smooth.hit(&ray, 0.0, 10.0).unwrap();
    assert_eq!(a.t, 1.0);
    close(a.barycentrics.unwrap(), Vec3::new(0.5, 0.25, 0.25));
    assert!((a.uv - Vec2::new(0.5, 0.25)).length() < 1e-6);
    close(a.normal, Vec3::Z);
    let expected = (Vec3::new(1.0, 0.0, 1.0).normalize() * 0.5
        + Vec3::Z * 0.25
        + Vec3::new(0.0, 1.0, 1.0).normalize() * 0.25)
        .normalize();
    close(b.normal, expected);
    close(a.point, b.point);
    assert!(b.front_face);
    assert_eq!(b.primitive_id, 0);
}

#[test]
fn triangle_edges_double_sided_mirrored_instance_and_missing_normals() {
    let mesh = Arc::new(Mesh::parse("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n").unwrap());
    let instance = MeshInstance::new(
        mesh,
        Mat4::from_scale(Vec3::new(-2.0, 1.0, 0.5)),
        Material::default(),
        true,
    )
    .unwrap();
    for p in [
        Vec3::ZERO,
        Vec3::new(-2.0, 0.0, 0.0),
        Vec3::new(0.0, 1.0, 0.0),
        Vec3::new(-0.5, 0.25, 0.0),
    ] {
        let front = instance
            .hit(&Ray::new(p + Vec3::Z, -Vec3::Z), 0.0, 10.0)
            .unwrap();
        close(front.normal, Vec3::Z);
        assert!(front.front_face);
        let back = instance
            .hit(&Ray::new(p - Vec3::Z, Vec3::Z), 0.0, 10.0)
            .unwrap();
        assert!(!back.front_face);
        close(back.outward_normal, Vec3::Z);
    }
    assert!(
        instance
            .hit(&Ray::new(Vec3::new(-1.5, 0.9, 1.0), -Vec3::Z), 0.0, 10.0)
            .is_none()
    );
}

#[test]
fn invalid_obj_rejected_and_convex_quads_triangulated() {
    for text in [
        "v 0 0 NaN",
        "v 0 0 0\nf 0 1 1",
        "v 0 0 0\nf 1 2 3",
        "v 0 0 0\nv 1 0 0\nv 2 0 0\nf 1 2 3",
    ] {
        assert!(Mesh::parse(text).is_err(), "{text}");
    }
    let mesh = Mesh::parse("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4").unwrap();
    assert_eq!(mesh.triangles.len(), 2);
    assert!(Mesh::parse("v 0 0 0\nv 1 0 0\nv 0.1 0.1 0\nv 0 1 0\nf 1 2 3 4").is_err());
    assert!(Mesh::parse("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 1\nf 1 2 3 4").is_err());
}

#[test]
fn texture_filter_wrap_orientation_and_color_decode() {
    // Pixel storage is top-to-bottom; OBJ v=1 selects the top row.
    let texture = |filter, wrap| Texture::Image {
        width: 2,
        height: 2,
        pixels: vec![Vec3::X, Vec3::Y, Vec3::Z, Vec3::ONE],
        filter,
        wrap,
    };
    let nearest = texture(Filter::Nearest, Wrap::Clamp);
    close(nearest.sample(Vec2::new(0.25, 0.75)), Vec3::X);
    close(nearest.sample(Vec2::new(0.25, 0.25)), Vec3::Z);
    close(nearest.sample(Vec2::new(-1.0, 2.0)), Vec3::X);
    let repeat = texture(Filter::Nearest, Wrap::Repeat);
    close(repeat.sample(Vec2::new(1.25, -0.25)), Vec3::X);
    let bilinear = texture(Filter::Bilinear, Wrap::Clamp);
    close(bilinear.sample(Vec2::splat(0.5)), Vec3::splat(0.5));
    let repeat = texture(Filter::Bilinear, Wrap::Repeat);
    close(
        repeat.sample(Vec2::new(0.0, 0.5)),
        repeat.sample(Vec2::new(1.0, 0.5)),
    );
    assert!((srgb_to_linear(0.5) - 0.214041).abs() < 1e-5);
    let checker = Texture::Checker {
        a: Vec3::ZERO,
        b: Vec3::ONE,
        scale: Vec2::splat(2.0),
    };
    assert_eq!(checker.sample(Vec2::new(-0.1, 0.1)), Vec3::ONE);
}

fn basic_scene() -> SceneFile {
    serde_json::from_str(
        r#"{
    "version":1,"camera":{},"render":{"width":4,"height":3},
    "materials":{"mat":{}},"geometries":{"sphere":{"kind":"sphere"}},
    "objects":[{"name":"ball","geometry":"sphere","material":"mat"}]
}"#,
    )
    .unwrap()
}

#[test]
fn scene_validation_errors_and_parent_transform_composition() {
    let mut file = basic_scene();
    let mut parent = file.objects[0].clone();
    parent.name = "parent".into();
    parent.geometry = None;
    parent.material = None;
    parent.transform.translation = [2.0, 0.0, 0.0];
    file.objects[0].parent = Some("parent".into());
    file.objects[0].transform.translation = [1.0, 0.0, 0.0];
    file.objects.push(parent);
    let loaded = file.build(Path::new(".")).unwrap();
    let hit = loaded
        .scene
        .nearest_hit(&Ray::new(Vec3::new(3.0, 0.0, 3.0), -Vec3::Z), 0.0, 10.0)
        .unwrap();
    assert_eq!(hit.t, 2.0);
    file.objects[1].parent = Some("ball".into());
    assert!(file.build(Path::new(".")).err().unwrap().contains("cycle"));
    let mut file = basic_scene();
    file.objects[0].material = Some("missing".into());
    assert!(
        file.build(Path::new("."))
            .err()
            .unwrap()
            .contains("unknown material")
    );
    let mut file = basic_scene();
    file.render.width = 0;
    assert!(file.build(Path::new(".")).is_err());
    let mut file = basic_scene();
    file.objects[0].transform.scale = [0.0; 3];
    assert!(file.build(Path::new(".")).is_err());
    let mut file = basic_scene();
    file.version = 2;
    assert!(file.build(Path::new(".")).is_err());
    let mut file = basic_scene();
    file.objects[0].parent = Some("missing".into());
    assert!(file.build(Path::new(".")).is_err());
    let mut value = serde_json::to_value(basic_scene()).unwrap();
    value["camera"]["typo"] = true.into();
    assert!(serde_json::from_value::<SceneFile>(value).is_err());
}

#[test]
fn scene_assets_resolve_relative_to_scene_and_render_finite_pixels() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let file = SceneFile::load(&root.join("scenes/mesh.json")).unwrap();
    let mut tiny = file.clone();
    tiny.render.width = 8;
    tiny.render.height = 6;
    let loaded = tiny.build(&root.join("scenes")).unwrap();
    let film = loaded.render().unwrap();
    for y in 0..6 {
        for x in 0..8 {
            assert!(film.pixel(x, y).is_finite());
            assert_eq!(film.sample_count(x, y), 1);
        }
    }
    assert!(
        tiny.build(Path::new("/definitely-missing-renderer-assets"))
            .is_err()
    );
}
