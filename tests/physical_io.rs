use renderer_project::scene_io::SceneFile;
use serde_json::{Value, json};
use std::{io::BufReader, path::Path, process::Command};

fn studio() -> Value {
    serde_json::from_str(include_str!("../scenes/physical_studio.json")).unwrap()
}

#[test]
fn physical_scene_contract_rejects_mixed_modes_invalid_albedo_and_bad_environment() {
    let base = Path::new(env!("CARGO_MANIFEST_DIR")).join("scenes");
    let valid = studio();
    let file: SceneFile = serde_json::from_value(valid.clone()).unwrap();
    let loaded = file.build(&base).unwrap();
    assert!(loaded.scene.lights.is_empty());
    assert!(loaded.scene.area_lights.is_empty());
    assert!(loaded.scene.environment.is_some());
    let first = valid["materials"]
        .as_object()
        .unwrap()
        .keys()
        .next()
        .unwrap();
    let mut cases = vec![];
    let mut v = valid.clone();
    v["render"]["integrator"] = json!("whitted");
    cases.push(v);
    let mut v = valid.clone();
    v["materials"][first]["physical"] = Value::Null;
    cases.push(v);
    for physical in [
        json!({"model":"diffuse","base_color":[1.1,0.0,0.0]}),
        json!({"model":"metal_rough","base_color":[0.5,0.5,0.5],"metallic":-0.1,"roughness":0.5}),
        json!({"model":"metal_rough","base_color":[0.5,0.5,0.5],"metallic":0.0,"roughness":1.1}),
        json!({"model":"dielectric","tint":[1.0,1.0,1.0],"ior":0.9}),
    ] {
        let mut v = valid.clone();
        v["materials"][first]["physical"] = physical;
        cases.push(v);
    }
    let mut v = valid.clone();
    v["textures"] =
        json!({"bad":{"kind":"checker","a":[2.0,1.0,1.0],"b":[0.0,0.0,0.0],"scale":[1.0,1.0]}});
    v["materials"][first]["texture"] = json!("bad");
    cases.push(v);
    let mut v = valid.clone();
    v["environment"]["intensity"] = json!(-1.0);
    cases.push(v);
    let mut v = valid;
    v["environment"]["path"] = json!("missing-environment.hdr");
    cases.push(v);
    for v in cases {
        let file: SceneFile = serde_json::from_value(v).unwrap();
        assert!(file.build(&base).is_err());
    }
    assert!(
        serde_json::from_value::<SceneFile>(json!({
            "version":1,"camera":{},"materials":{},"geometries":{},"objects":[],
            "environment":{"kind":"hdr","path":"x.hdr","unknown":0}
        }))
        .is_err()
    );
}

#[test]
fn cli_progressive_hdr_is_raw_linear_and_independent_of_png_exposure() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let temp = std::env::temp_dir().join(format!("renderer-physical-{}", std::process::id()));
    std::fs::create_dir_all(&temp).unwrap();
    let mut file = studio();
    // No geometry: every sample has known radiance, including values above one.
    file["objects"] = json!([]);
    file["environment"] = json!({"kind":"constant","radiance":[8.0,4.0,2.0]});
    let scene = temp.join("scene.json");
    std::fs::write(&scene, serde_json::to_vec(&file).unwrap()).unwrap();
    for (name, exposure) in [("low", "-2"), ("high", "2")] {
        let output = Command::new(env!("CARGO_BIN_EXE_renderer-project"))
            .current_dir(root)
            .arg("render")
            .arg(&scene)
            .args([
                "--width",
                "9",
                "--height",
                "5",
                "--spp",
                "3",
                "--threads",
                "2",
                "--progressive",
                "--preview-every",
                "2",
                "--exposure",
                exposure,
                "--output",
            ])
            .arg(temp.join(format!("{name}.png")))
            .arg("--hdr-output")
            .arg(temp.join(format!("{name}.hdr")))
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(String::from_utf8_lossy(&output.stderr).contains("Preview 3/3"));
    }
    assert_eq!(
        std::fs::read(temp.join("low.hdr")).unwrap(),
        std::fs::read(temp.join("high.hdr")).unwrap()
    );
    assert_ne!(
        std::fs::read(temp.join("low.png")).unwrap(),
        std::fs::read(temp.join("high.png")).unwrap()
    );
    let decoder = image::codecs::hdr::HdrDecoder::new(BufReader::new(
        std::fs::File::open(temp.join("low.hdr")).unwrap(),
    ))
    .unwrap();
    assert_eq!(
        (decoder.metadata().width, decoder.metadata().height),
        (9, 5)
    );
    for pixel in decoder.read_image_hdr().unwrap() {
        assert_eq!(pixel.0, [8.0, 4.0, 2.0]);
    }
    std::fs::remove_dir_all(temp).unwrap();
}
