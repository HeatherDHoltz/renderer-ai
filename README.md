# Rust CPU Renderer

An AI-assisted graphics portfolio project extending Heather's early-semester Rust ray tracer. Development is in progress; [STATUS.md](STATUS.md) distinguishes verified features from the full [implementation plan](PLAN.md).

```sh
cargo run --release --locked -- smoke --width 640 --height 480 --output output/smoke.png
cargo test --locked
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

Current foundation: perspective camera, sphere/plane intersections, educational Lambert/Blinn–Phong lighting, point-light hard shadows, and PNG output. A library backs the command-line application. Run `cargo run --release --example legacy` from an output directory to reproduce the original five 1024×768 demonstrations.

![Original educational shading baseline](gallery/baseline.png)

The broader renderer is being built and tested through documented milestones. This repository is separate from the manually authored class submission. Heather directs and reviews the portfolio project; Codex assists with implementation, testing, debugging, and documentation. No repository license has been selected.
