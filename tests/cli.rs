use std::{path::Path, process::Command};

#[test]
fn cli_validates_assets_and_renders_from_another_working_directory() {
    let binary = env!("CARGO_BIN_EXE_renderer-project");
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let temp = std::env::temp_dir().join(format!("renderer-cli-{}", std::process::id()));
    std::fs::create_dir_all(&temp).unwrap();
    let scene = root.join("scenes/mesh.json");
    let validate = Command::new(binary)
        .current_dir(&temp)
        .arg("validate")
        .arg(&scene)
        .output()
        .unwrap();
    assert!(
        validate.status.success(),
        "{}",
        String::from_utf8_lossy(&validate.stderr)
    );
    let output = temp.join("nested/test.png");
    let render = Command::new(binary)
        .current_dir(&temp)
        .arg("render")
        .arg(&scene)
        .args(["--width", "8", "--height", "6", "--depth", "2", "--output"])
        .arg(&output)
        .output()
        .unwrap();
    assert!(
        render.status.success(),
        "{}",
        String::from_utf8_lossy(&render.stderr)
    );
    assert_eq!(image::image_dimensions(&output).unwrap(), (8, 6));
    let progressive = temp.join("progressive.png");
    let preview = Command::new(binary)
        .current_dir(&temp)
        .arg("render")
        .arg(&scene)
        .args([
            "--width",
            "8",
            "--height",
            "6",
            "--spp",
            "3",
            "--threads",
            "2",
            "--tile-size",
            "5",
            "--progressive",
            "--preview-every",
            "2",
            "--output",
        ])
        .arg(&progressive)
        .output()
        .unwrap();
    assert!(
        preview.status.success(),
        "{}",
        String::from_utf8_lossy(&preview.stderr)
    );
    assert!(String::from_utf8_lossy(&preview.stderr).contains("Preview 2/3"));
    assert!(String::from_utf8_lossy(&preview.stderr).contains("Preview 3/3"));
    assert_eq!(image::image_dimensions(&progressive).unwrap(), (8, 6));
    let invalid = Command::new(binary)
        .arg("render")
        .arg(&scene)
        .args(["--width", "0"])
        .output()
        .unwrap();
    assert!(!invalid.status.success());
    assert!(String::from_utf8_lossy(&invalid.stderr).contains("dimensions"));
    std::fs::remove_dir_all(temp).unwrap();
}
