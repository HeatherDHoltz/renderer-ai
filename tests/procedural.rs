use renderer_project::{
    procedural::{GeneratorFile, expand},
    scene_io::SceneFile,
};
use std::{collections::BTreeMap, path::Path, process::Command};

fn config(name: &str) -> GeneratorFile {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    GeneratorFile::load(&root.join(format!("scenes/generators/{name}.json"))).unwrap()
}
#[test]
fn seeded_generators_repeat_and_produce_valid_finite_scenes() {
    for name in ["scatter", "garden"] {
        let mut input = config(name);
        let a = input.generate().unwrap();
        let b = input.generate().unwrap();
        assert_eq!(
            serde_json::to_vec(&a).unwrap(),
            serde_json::to_vec(&b).unwrap()
        );
        input.seed += 1;
        let c = input.generate().unwrap();
        assert_ne!(
            serde_json::to_vec(&a).unwrap(),
            serde_json::to_vec(&c).unwrap()
        );
        let mut file = a;
        file.render.width = 16;
        file.render.height = 12;
        file.render.spp = 2;
        file.render.threads = 2;
        let film = file.build(Path::new(".")).unwrap().render().unwrap();
        assert!((0..12).all(|y| {
            (0..16).all(|x| film.pixel(x, y).is_finite() && film.sample_count(x, y) == 2)
        }));
    }
}
#[test]
fn lsystem_balancing_limits_and_turtle_branch_restore_are_checked() {
    for (axiom, rules, iterations, budget) in [
        ("F]", BTreeMap::new(), 0, 100),
        ("[F", BTreeMap::new(), 0, 100),
        ("F?", BTreeMap::new(), 0, 100),
        ("F", BTreeMap::from([("F".into(), "FF".into())]), 12, 100),
        ("X", BTreeMap::new(), 0, 100),
        ("F", BTreeMap::from([("[".into(), "FF".into())]), 1, 100),
        ("F", BTreeMap::from([("F".into(), "[F".into())]), 1, 100),
    ] {
        assert!(expand(axiom, &rules, iterations, budget).is_err());
    }
    let input = config("garden");
    let mut value = serde_json::to_value(input).unwrap();
    value["generator"]["axiom"] = "F[+F]F".into();
    value["generator"]["iterations"] = 0.into();
    value["generator"]["count"] = 1.into();
    value["generator"]["step"] = 1.0.into();
    value["generator"]["angle_degrees"] = 90.0.into();
    let input: GeneratorFile = serde_json::from_value(value.clone()).unwrap();
    let file = input.generate().unwrap();
    let branches: Vec<_> = file
        .objects
        .iter()
        .filter(|o| o.name.contains("branch"))
        .collect();
    assert_eq!(branches.len(), 3);
    assert_eq!(branches[0].transform.translation, [0.0, 0.5, 0.0]);
    assert!((branches[1].transform.translation[0] + 0.5).abs() < 1e-5);
    assert!((branches[1].transform.translation[1] - 1.0).abs() < 1e-5);
    // Final trunk resumes from the saved tip and orientation, not the branch tip.
    assert_eq!(branches[2].transform.translation, [0.0, 1.5, 0.0]);
    value["generator"]["max_segments"] = 2.into();
    assert!(
        serde_json::from_value::<GeneratorFile>(value)
            .unwrap()
            .generate()
            .is_err()
    );
}
#[test]
fn invalid_generator_palette_counts_bounds_and_unknown_fields_are_errors() {
    let value = serde_json::to_value(config("scatter")).unwrap();
    for (field, bad) in [
        ("count", serde_json::json!(20001)),
        ("size", serde_json::json!([1, 0.5])),
        ("shapes", serde_json::json!([])),
        ("bounds_max", serde_json::json!([-5, -4])),
    ] {
        let mut v = value.clone();
        v["generator"][field] = bad;
        assert!(
            serde_json::from_value::<GeneratorFile>(v)
                .unwrap()
                .generate()
                .is_err()
        );
    }
    let mut v = value.clone();
    v["palette"] = serde_json::json!([[1.1, 0, 0]]);
    assert!(
        serde_json::from_value::<GeneratorFile>(v)
            .unwrap()
            .generate()
            .is_err()
    );
    let mut v = value;
    v["generator"]["run_shell"] = "not allowed".into();
    assert!(serde_json::from_value::<GeneratorFile>(v).is_err());
}
#[test]
fn generator_cli_output_is_portable_scene_json_and_renders_offline() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let temp = std::env::temp_dir().join(format!("renderer-generator-{}", std::process::id()));
    let scene = temp.join("nested/scatter.json");
    let binary = env!("CARGO_BIN_EXE_renderer-project");
    let result = Command::new(binary)
        .current_dir(std::env::temp_dir())
        .arg("generate")
        .arg(root.join("scenes/generators/scatter.json"))
        .arg("--output")
        .arg(&scene)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let loaded = SceneFile::load(&scene)
        .unwrap()
        .build(scene.parent().unwrap())
        .unwrap();
    assert_eq!(loaded.scene.shapes.len(), 81);
    let result = Command::new(binary)
        .arg("render")
        .arg(&scene)
        .args(["--width", "8", "--height", "6", "--spp", "1", "--output"])
        .arg(temp.join("test.png"))
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert_eq!(
        image::image_dimensions(temp.join("test.png")).unwrap(),
        (8, 6)
    );
    std::fs::remove_dir_all(temp).unwrap();
}
