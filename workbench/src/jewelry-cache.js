import * as THREE from "../vendor/three.module.js";

// Keep the full-resolution precious-material image while only the hearth moves.
// Both layers have depth, so velvet rims and scene objects still occlude rings.
export function createJewelryCache(renderer, scene, camera, baseTarget, { samples = 4 } = {}) {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: Math.min(samples, renderer.capabilities.maxSamples),
  });
  target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  // The room target contains room depth only. Live-object depth comes from
  // the jewellery target, avoiding both self-occlusion and permissive biases.
  scene.traverse(o => { if (o.isLight) o.layers.enable(1); });
  let revisions = 0, roomKey = null, roomValid = false;
  const stats = { roomRenders: 0, roomReuses: 0 };
  function renderScene() {
    const previous = renderer.shadowMap.render;
    renderer.shadowMap.render = function(lights, currentScene, view) {
      const mask = view.layers.mask;
      try {
        view.layers.enable(0); view.layers.enable(1);
        return previous.call(this, lights, currentScene, view);
      } finally { view.layers.mask = mask; }
    };
    try { renderer.render(scene, camera); }
    finally { renderer.shadowMap.render = previous; }
  }
  return {
    stats,
    texture: target.texture,
    depth: target.depthTexture,
    resize(w, h) {
      target.setSize(w, h);
      roomKey = null; roomValid = false;
    },
    render(dirty, { reuseRoom = false, key = null } = {}) {
      const mask = camera.layers.mask;
      const redrawRoom = !reuseRoom || !roomValid || roomKey !== key;
      if (redrawRoom) try {
        camera.layers.set(0);
        renderer.setRenderTarget(baseTarget);
        // Shadow casters still include live jewellery, although the room colour
        // pass excludes it. Its current depth comes from the jewellery target.
        renderScene();
        stats.roomRenders++;
        roomKey = reuseRoom ? key : null;
        roomValid = true;
      } finally {
        camera.layers.mask = mask;
      }
      if (!redrawRoom) stats.roomReuses++;
      if (dirty) {
        const background = scene.background,
          clear = renderer.getClearColor(new THREE.Color()),
          alpha = renderer.getClearAlpha();
        try {
          camera.layers.set(1);
          scene.background = null;
          renderer.setClearColor(0, 0);
          renderer.setRenderTarget(target);
          renderScene();
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
    },
  };
}
