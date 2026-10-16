use glam::{Mat4, Quat, Vec3};
use renderer_project::{
    camera::Camera,
    film::{LinearFilm, ToneMap, linear_to_srgb},
    geometry::{Instance, Primitive},
    material::Material,
    ray::Ray,
    shape::Shape,
    transform::Transform,
};

fn material() -> Material {
    Material {
        diffuse: Vec3::splat(0.5),
        specular: Vec3::ZERO,
        shininess: 32.0,
    }
}
fn instance(primitive: Primitive) -> Instance {
    Instance::new(primitive, Mat4::IDENTITY, material()).unwrap()
}
fn close(a: Vec3, b: Vec3) {
    assert!((a - b).length() < 1e-4, "{a:?} != {b:?}");
}

#[test]
fn affine_ray_parameter_and_inverse_transpose_normal() {
    let model = Mat4::from_scale_rotation_translation(
        Vec3::new(-2.0, 1.0, 0.5),
        Quat::from_rotation_z(0.4),
        Vec3::new(3.0, 2.0, -1.0),
    );
    let transform = Transform::new(model).unwrap();
    let p = Vec3::new(0.5_f32.sqrt(), 0.5_f32.sqrt(), 0.0);
    let world = model.transform_point3(p);
    let normal = transform.normal(p);
    let sphere = Instance::new(Primitive::Sphere, model, material()).unwrap();
    let ray = Ray::new(world + 3.0 * normal, -2.0 * normal);
    let hit = sphere.hit(&ray, 0.0, 100.0).unwrap();
    assert!((hit.t - 1.5).abs() < 1e-4);
    close(hit.point, world);
    close(hit.outward_normal, normal);
    assert!(hit.front_face);
    let local = ray.transform(&transform.inverse());
    close(model.transform_point3(local.point(hit.t)), hit.point);
    close(transform.inverse().transform_point3(world), p);
    let tangent = model.transform_vector3(Vec3::new(-p.y, p.x, 0.0));
    assert!(normal.dot(tangent).abs() < 1e-5);
}

#[test]
fn ellipsoid_width_is_not_used_as_height() {
    let sphere = Instance::new(
        Primitive::Sphere,
        Mat4::from_scale(Vec3::new(2.0, 1.0, 0.5)),
        material(),
    )
    .unwrap();
    assert!(
        sphere
            .hit(&Ray::new(Vec3::new(0.0, 1.5, 3.0), -Vec3::Z), 0.0, 10.0)
            .is_none()
    );
    let hit = sphere
        .hit(&Ray::new(3.0 * Vec3::Z, -Vec3::Z), 0.0, 10.0)
        .unwrap();
    assert_eq!(hit.t, 2.5);
}

#[test]
fn canonical_sides_and_inside_exits() {
    for primitive in [Primitive::Sphere, Primitive::Box, Primitive::Cylinder] {
        let shape = instance(primitive);
        let hit = shape
            .hit(&Ray::new(3.0 * Vec3::Z, -2.0 * Vec3::Z), 0.0, 10.0)
            .unwrap();
        assert_eq!(hit.t, 1.0);
        close(hit.outward_normal, Vec3::Z);
        let inside = shape
            .hit(&Ray::new(Vec3::ZERO, Vec3::X), 0.001, 10.0)
            .unwrap();
        assert_eq!(inside.t, 1.0);
        assert!(!inside.front_face);
        close(inside.outward_normal, Vec3::X);
        close(inside.normal, -Vec3::X);
        assert!(
            shape
                .hit(&Ray::new(3.0 * Vec3::Z, -Vec3::Z), 0.0, 1.9)
                .is_none()
        );
    }
}

#[test]
fn caps_finite_walls_and_cone_linear_case() {
    for primitive in [Primitive::Cylinder, Primitive::Cone] {
        let shape = instance(primitive);
        let bottom = shape
            .hit(&Ray::new(-3.0 * Vec3::Y, Vec3::Y), 0.0, 10.0)
            .unwrap();
        assert_eq!(bottom.t, 2.0);
        close(bottom.outward_normal, -Vec3::Y);
        assert!(
            shape
                .hit(&Ray::new(Vec3::new(0.0, 1.5, 3.0), -Vec3::Z), 0.0, 10.0)
                .is_none()
        );
    }
    let cylinder = instance(Primitive::Cylinder);
    let top = cylinder
        .hit(&Ray::new(3.0 * Vec3::Y, -Vec3::Y), 0.0, 10.0)
        .unwrap();
    assert_eq!(top.t, 2.0);
    close(top.outward_normal, Vec3::Y);
    let cone = instance(Primitive::Cone);
    let hit = cone
        .hit(&Ray::new(Vec3::Z, Vec3::new(0.0, -1.0, -0.5)), 0.0, 10.0)
        .unwrap();
    assert!((hit.t - 0.5).abs() < 1e-5);
    close(hit.point, Vec3::new(0.0, -0.5, 0.75));
    let apex = cone
        .hit(&Ray::new(2.0 * Vec3::Y, -Vec3::Y), 0.0, 10.0)
        .unwrap();
    assert_eq!(apex.t, 1.0);
    assert!(apex.normal.is_finite());
}

#[test]
fn parallel_tangent_and_degenerate_queries() {
    let box_shape = instance(Primitive::Box);
    assert!(
        box_shape
            .hit(&Ray::new(Vec3::new(2.0, 0.0, 3.0), -Vec3::Z), 0.0, 10.0)
            .is_none()
    );
    let sphere = instance(Primitive::Sphere);
    assert_eq!(
        sphere
            .hit(&Ray::new(Vec3::new(1.0, 0.0, 3.0), -Vec3::Z), 0.0, 10.0)
            .unwrap()
            .t,
        3.0
    );
    for primitive in [
        Primitive::Sphere,
        Primitive::Plane,
        Primitive::Box,
        Primitive::Cylinder,
        Primitive::Cone,
    ] {
        let shape = instance(primitive);
        assert!(
            shape
                .hit(&Ray::new(Vec3::ZERO, Vec3::ZERO), 0.0, 10.0)
                .is_none()
        );
        assert!(
            shape
                .hit(&Ray::new(Vec3::ZERO, Vec3::Z), 2.0, 1.0)
                .is_none()
        );
    }
}

#[test]
fn invalid_transforms_and_camera_inputs_are_errors() {
    assert!(Transform::new(Mat4::from_scale(Vec3::new(1.0, 0.0, 1.0))).is_err());
    let mut projective = Mat4::IDENTITY;
    projective.x_axis.w = 0.1;
    assert!(Transform::new(projective).is_err());
    assert!(Transform::new(Mat4::from_scale(Vec3::splat(1e-3))).is_ok());
    assert!(Camera::perspective(Vec3::ZERO, Vec3::ZERO, Vec3::Y, 1.0, 45.0).is_err());
    assert!(Camera::perspective(Vec3::ZERO, -Vec3::Z, Vec3::Z, 1.0, 45.0).is_err());
    for fov in [0.0, 180.0, f32::NAN] {
        assert!(Camera::perspective(Vec3::ZERO, -Vec3::Z, Vec3::Y, 1.0, fov).is_err());
    }
    assert!(Camera::orthographic(Vec3::ZERO, -Vec3::Z, Vec3::Y, 1.0, 0.0).is_err());
}

#[test]
fn orthographic_rays_are_parallel_and_film_y_is_up() {
    let camera = Camera::orthographic(Vec3::ZERO, -Vec3::Z, Vec3::Y, 2.0, 4.0).unwrap();
    for (u, v, p) in [
        (0.0, 0.0, Vec3::new(-4.0, -2.0, 0.0)),
        (1.0, 1.0, Vec3::new(4.0, 2.0, 0.0)),
    ] {
        let ray = camera.ray(u, v);
        close(ray.origin(), p);
        close(ray.direction(), -Vec3::Z);
    }
}

#[test]
fn linear_film_preserves_hdr_averages_then_encodes_srgb() {
    let mut film = LinearFilm::new(1, 1).unwrap();
    film.add_sample(0, 0, Vec3::splat(8.0)).unwrap();
    film.add_sample(0, 0, Vec3::ZERO).unwrap();
    assert_eq!(film.pixel(0, 0), Vec3::splat(4.0));
    assert_eq!(film.sample_count(0, 0), 2);
    assert_eq!(
        film.display(-2.0, ToneMap::Linear)
            .unwrap()
            .get_pixel(0, 0)
            .0,
        [255; 3]
    );
    assert!((linear_to_srgb(0.0031308) - 0.04045).abs() < 1e-5);
    assert!((linear_to_srgb(0.18) - 0.461356).abs() < 1e-5);
    assert!(film.add_sample(0, 0, Vec3::splat(f32::NAN)).is_err());
    assert!(film.add_sample(1, 0, Vec3::ONE).is_err());
    assert!(LinearFilm::new(0, 10).is_err());
}
