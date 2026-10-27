# The Diamond Express

The browser workshop uses Three.js and custom gemstone shaders. The Rust renderer is separate.

With Node.js 20+:

```sh
npm run dev
```

Open http://127.0.0.1:4173/. Click a station to approach it, drag to look around, scroll to zoom, and press Escape to return to the desk. Click the object’s working part after arriving to operate it. `?fps` shows frame rate; `?debug` exposes inspection tools; `?static` keeps the still image.

`npm run build` creates a local build. For publishing, follow [the preparation order](../docs/STARTUP_FAST_DELIVERY.md); a plain authoring build restores large original assets.

[Editing guide](../docs/DEVELOPMENT.md) · [Rendering limits](../docs/RENDERING.md) · [Credits](../docs/ASSETS.md)
