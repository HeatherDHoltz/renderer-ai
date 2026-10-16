use renderer_project::{
    film::LinearFilm,
    render::{TiledRenderer, render_progressive, render_sampled, save_preview},
    scene_io::SceneFile,
};
use std::path::Path;

fn compare(a: &LinearFilm, b: &LinearFilm) {
    assert_eq!((a.width, a.height), (b.width, b.height));
    for y in 0..a.height {
        for x in 0..a.width {
            assert_eq!(a.pixel(x, y), b.pixel(x, y), "pixel ({x},{y})");
            assert_eq!(a.sample_count(x, y), b.sample_count(x, y));
        }
    }
}

#[test]
fn odd_images_match_across_threads_and_tile_sizes() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut file = SceneFile::load(&root.join("scenes/soft_shadows.json")).unwrap();
    file.render.width = 37;
    file.render.height = 23;
    file.render.spp = 11;
    file.render.threads = 1;
    file.render.tile_size = 4;
    let loaded = file.build(&root.join("scenes")).unwrap();
    let reference = loaded.render().unwrap();
    for (threads, tile_size) in [(2, 4), (4, 13), (0, 64)] {
        let mut settings = loaded.render.clone();
        settings.threads = threads;
        settings.tile_size = tile_size;
        compare(
            &reference,
            &render_sampled(&loaded.camera, &loaded.scene, loaded.background, &settings).unwrap(),
        );
    }
    assert_eq!(
        TiledRenderer::new(&loaded.render).unwrap().thread_count(),
        1
    );
}

#[test]
fn every_progressive_prefix_and_final_match_direct_render() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut file = SceneFile::load(&root.join("scenes/soft_shadows.json")).unwrap();
    file.render.width = 17;
    file.render.height = 11;
    file.render.spp = 11;
    file.render.threads = 3;
    file.render.tile_size = 7;
    file.render.preview_every = 3;
    let loaded = file.build(&root.join("scenes")).unwrap();
    let mut counts = vec![];
    let progressive = render_progressive(
        &loaded.camera,
        &loaded.scene,
        loaded.background,
        &loaded.render,
        |film, spp| {
            counts.push(spp);
            let mut settings = loaded.render.clone();
            settings.spp = spp;
            settings.threads = 1;
            settings.tile_size = 16;
            compare(
                film,
                &render_sampled(&loaded.camera, &loaded.scene, loaded.background, &settings)?,
            );
            Ok(())
        },
    )
    .unwrap();
    assert_eq!(counts, vec![3, 6, 9, 11]);
    compare(&progressive, &loaded.render().unwrap());
}

#[test]
fn stopped_progress_callback_leaves_a_valid_complete_preview() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut file = SceneFile::load(&root.join("scenes/soft_shadows.json")).unwrap();
    file.render.width = 13;
    file.render.height = 9;
    file.render.spp = 8;
    file.render.threads = 2;
    file.render.preview_every = 3;
    let loaded = file.build(&root.join("scenes")).unwrap();
    let directory = std::env::temp_dir().join(format!("renderer-preview-{}", std::process::id()));
    let path = directory.join("latest.png");
    let stopped = render_progressive(
        &loaded.camera,
        &loaded.scene,
        loaded.background,
        &loaded.render,
        |film, _| {
            save_preview(film, &loaded.render, &path)?;
            Err("intentional stop after first complete preview".into())
        },
    );
    assert!(stopped.is_err());
    let image = image::open(&path).unwrap().to_rgb8();
    let mut settings = loaded.render.clone();
    settings.spp = 3;
    let expected = render_sampled(&loaded.camera, &loaded.scene, loaded.background, &settings)
        .unwrap()
        .display(settings.exposure, settings.tone().unwrap())
        .unwrap();
    assert_eq!(image, expected);
    std::fs::remove_dir_all(directory).unwrap();
}
