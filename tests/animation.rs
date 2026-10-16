use glam::{Quat, Vec3};
use renderer_project::{
    accel::AccelKind,
    animation::{FrameRange, Keyframe, TransformTrack},
    ray::Ray,
    scene_io::SceneFile,
};
use std::{path::Path, process::Command};

fn key(time: f64, translation: Vec3, rotation: Quat, scale: Vec3) -> Keyframe {
    Keyframe {
        time,
        translation: translation.to_array(),
        rotation: rotation.to_array(),
        scale: scale.to_array(),
    }
}
fn close(a: Vec3, b: Vec3) {
    assert!((a - b).length() < 2e-5, "{a:?} != {b:?}");
}

#[test]
fn keyframe_endpoints_midpoint_shortest_arc_and_nearly_equal_rotation() {
    let a = key(1.0, Vec3::ZERO, Quat::IDENTITY, Vec3::ONE);
    let b = key(
        3.0,
        Vec3::new(4.0, 2.0, 0.0),
        Quat::from_rotation_y(90f32.to_radians()),
        Vec3::splat(3.0),
    );
    let track = TransformTrack {
        keyframes: vec![a, b],
    };
    close(
        track.matrix_at(-1.0).unwrap().transform_point3(Vec3::X),
        Vec3::X,
    );
    close(
        track.matrix_at(1.0).unwrap().transform_point3(Vec3::X),
        Vec3::X,
    );
    close(
        track.matrix_at(3.0).unwrap().transform_point3(Vec3::X),
        Vec3::new(4.0, 2.0, -3.0),
    );
    close(
        track.matrix_at(9.0).unwrap().transform_point3(Vec3::X),
        Vec3::new(4.0, 2.0, -3.0),
    );
    close(
        track.matrix_at(2.0).unwrap().transform_point3(Vec3::X),
        Vec3::new(2.0 + 2f32.sqrt(), 1.0, -2f32.sqrt()),
    );
    // q and -q represent the same frame. Crossing the quaternion sign seam must stay still.
    let q = Quat::from_rotation_z(0.7);
    let track = TransformTrack {
        keyframes: vec![
            key(0.0, Vec3::ZERO, q, Vec3::ONE),
            key(1.0, Vec3::ZERO, -q, Vec3::ONE),
        ],
    };
    close(
        track.matrix_at(0.5).unwrap().transform_vector3(Vec3::Y),
        q * Vec3::Y,
    );
    // +170 to -170 degrees takes the 20-degree route through 180.
    let track = TransformTrack {
        keyframes: vec![
            key(
                0.0,
                Vec3::ZERO,
                Quat::from_rotation_y(170f32.to_radians()),
                Vec3::ONE,
            ),
            key(
                1.0,
                Vec3::ZERO,
                Quat::from_rotation_y(-170f32.to_radians()),
                Vec3::ONE,
            ),
        ],
    };
    close(
        track.matrix_at(0.5).unwrap().transform_vector3(Vec3::X),
        -Vec3::X,
    );
}

#[test]
fn invalid_tracks_ranges_and_unvisited_segments_are_rejected() {
    let identity = || key(0.0, Vec3::ZERO, Quat::IDENTITY, Vec3::ONE);
    let mut a = identity();
    a.rotation = [0.0; 4];
    let mut b = identity();
    b.scale = [-1.0, 1.0, 1.0];
    b.time = 1.0;
    let mut c = identity();
    c.time = f64::NAN;
    for keys in [
        vec![],
        vec![a],
        vec![identity(), identity()],
        vec![identity(), b],
        vec![c],
    ] {
        assert!(TransformTrack { keyframes: keys }.matrix_at(0.0).is_err());
    }
    for range in ["2:1", "0:10000", "-1:0", "x:y", "0:1000001"] {
        assert!(range.parse::<FrameRange>().is_err());
    }
    let frames: FrameRange = "10:12".parse().unwrap();
    assert_eq!(
        frames.times(2.0, 1.0).unwrap(),
        vec![(10, 6.0), (11, 6.5), (12, 7.0)]
    );
    assert!(frames.times(0.0, 0.0).is_err());
    assert!(frames.times(1.0, f64::NAN).is_err());
}

#[test]
fn hierarchy_motion_rebuilds_mesh_and_instance_bounds_with_stable_ids() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    // Put the child before its parent, to also exercise order-independent graph evaluation.
    let mut file:SceneFile=serde_json::from_str(r#"{"version":1,"camera":{},"materials":{"m":{}},"geometries":{"g":{"kind":"mesh","path":"../assets/uv-sphere.obj"}},"objects":[
      {"name":"child","parent":"parent","geometry":"g","material":"m","transform":{"translation":[2,0,0]}},
      {"name":"parent","transform":{"translation":[10,0,0]},"animation":{"keyframes":[
        {"time":0,"translation":[0,0,0],"rotation":[0,0,0,1],"scale":[1,1,1]},
        {"time":2,"translation":[0,0,0],"rotation":[0,0.70710678,0,0.70710678],"scale":[1,1,1]}]}}
    ]}"#).unwrap();
    for backend in [AccelKind::None, AccelKind::Bvh, AccelKind::Octree] {
        file.render.accel = backend;
        for time in [0.0, 1.0, 2.0] {
            let scene = file.build_at(&root.join("scenes"), time).unwrap().scene;
            let center = Vec3::new(10.0, 0.0, 0.0)
                + Quat::from_rotation_y((time as f32 * 45.0).to_radians()) * (2.0 * Vec3::X);
            let hit = scene
                .nearest_hit(&Ray::new(center + 3.0 * Vec3::Y, -Vec3::Y), 0.0, 10.0)
                .unwrap();
            close(hit.point, center + Vec3::Y);
            assert_eq!(hit.object_id, 0);
            if time == 2.0 {
                assert!(
                    scene
                        .nearest_hit(&Ray::new(Vec3::new(12.0, 3.0, 0.0), -Vec3::Y), 0.0, 10.0)
                        .is_none()
                );
            }
        }
    }
}

#[test]
fn animation_cli_sequence_matches_direct_static_frames_and_records_times() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let output = std::env::temp_dir().join(format!("renderer-animation-{}", std::process::id()));
    let binary = env!("CARGO_BIN_EXE_renderer-project");
    let scene = root.join("scenes/animation.json");
    let result = Command::new(binary)
        .current_dir(std::env::temp_dir())
        .arg("animate")
        .arg(&scene)
        .args([
            "--frames",
            "0:2",
            "--fps",
            "1",
            "--width",
            "16",
            "--height",
            "12",
            "--spp",
            "2",
            "--threads",
            "2",
            "--output",
        ])
        .arg(&output)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(output.join("animation.json")).unwrap()).unwrap();
    assert_eq!(manifest["frames"].as_array().unwrap().len(), 3);
    for frame in 0..3 {
        assert_eq!(manifest["frames"][frame]["time_seconds"], frame as f64);
        let direct = output.join("direct.png");
        let result = Command::new(binary)
            .arg("render")
            .arg(&scene)
            .args([
                "--width",
                "16",
                "--height",
                "12",
                "--spp",
                "2",
                "--threads",
                "1",
                "--time",
                &frame.to_string(),
                "--output",
            ])
            .arg(&direct)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        assert_eq!(
            std::fs::read(&direct).unwrap(),
            std::fs::read(output.join(format!("frame-{frame:06}.png"))).unwrap()
        );
    }
    assert_ne!(
        std::fs::read(output.join("frame-000000.png")).unwrap(),
        std::fs::read(output.join("frame-000002.png")).unwrap()
    );
    std::fs::remove_dir_all(output).unwrap();
}
