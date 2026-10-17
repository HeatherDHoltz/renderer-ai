import * as THREE from "../vendor/three.module.js";

// Keep the full-resolution precious-material image while only the hearth moves.
// Both layers have depth, so velvet rims and scene objects still occlude rings.
export function createJewelryCache(renderer, scene, camera, baseTarget) {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: Math.min(4, renderer.capabilities.maxSamples),
  });
  target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const front = new THREE.MeshBasicMaterial({ colorWrite: false }),
    both = front.clone();
  both.side = THREE.DoubleSide;
  const precious = [];
  scene.traverse((o) => {
    if (o.isMesh && o.layers.isEnabled(1) && o.material.visible !== false)
      precious.push(o);
    if (o.isLight) o.layers.enable(1);
  });
  let revisions = 0;
  return {
    texture: target.texture,
    depth: target.depthTexture,
    resize(w, h) {
      target.setSize(w, h);
    },
    render(dirty) {
      const mask = camera.layers.mask;
      const saved = precious.map((o) => ({
        o,
        material: o.material,
        callback: o.onBeforeRender,
      }));
      try {
        for (const s of saved) {
          s.o.material = s.material.side === THREE.DoubleSide ? both : front;
          s.o.onBeforeRender = () => {};
        }
        camera.layers.set(0);
        camera.layers.enable(1);
        renderer.setRenderTarget(baseTarget);
        renderer.render(scene, camera);
      } finally {
        for (const s of saved) {
          s.o.material = s.material;
          s.o.onBeforeRender = s.callback;
        }
        camera.layers.mask = mask;
      }
      if (dirty) {
        const background = scene.background,
          clear = renderer.getClearColor(new THREE.Color()),
          alpha = renderer.getClearAlpha();
        try {
          camera.layers.set(1);
          scene.background = null;
          renderer.setClearColor(0, 0);
          renderer.setRenderTarget(target);
          renderer.render(scene, camera);
          revisions++;
        } finally {
          scene.background = background;
          renderer.setClearColor(clear, alpha);
          camera.layers.mask = mask;
        }
      }
      return revisions;
    },
    dispose() {
      target.dispose();
      front.dispose();
      both.dispose();
    },
  };
}
