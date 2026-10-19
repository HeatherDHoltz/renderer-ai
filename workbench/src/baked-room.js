import * as THREE from "../vendor/three.module.js";

// Explicit ownership: these textures already contain Cycles lighting, surface
// colour and static highlights. Never feed them back through a lit material.
export function bakedRoomMaterial(texture, range = 16) {
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({ map: texture });
  material.name = "Cycles baked appearance";
  material.userData.renderRoute = "baked_room";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.cyclesRgbmRange = { value: range };
    shader.fragmentShader = "uniform float cyclesRgbmRange;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#ifdef USE_MAP
        vec4 encodedRadiance = texture2D(map, vMapUv);
        diffuseColor.rgb *= encodedRadiance.rgb * encodedRadiance.a * cyclesRgbmRange;
      #endif`,
    );
  };
  material.customProgramCacheKey = () => "cycles-baked-radiance-v1";
  return material;
}

export function renderRoute(name, spec) {
  if (spec.renderRoute) return spec.renderRoute;
  if (/mirror/i.test(name)) return "live_mirror";
  if (spec.kind === "gilt" || spec.kind === "metal" || (spec.metallic ?? 0) > 0.5)
    return "live_metal";
  // Mixed metal/cloth surfaces need their original shader until split/exported.
  return "legacy_baked";
}

export async function loadBakedRoom(base, gltf, images, manifestPath) {
  if (!manifestPath) return null;
  const manifestURL = new URL(manifestPath, base);
  const response = await fetch(manifestURL);
  if (!response.ok) throw new Error(`Cycles appearance manifest: ${response.status}`);
  const manifest = await response.json();
  if (manifest.version !== 1) throw new Error("Unsupported Cycles appearance manifest");
  const replacements = new Set();
  const group = new THREE.Group();
  group.name = "Cycles baked room surfaces";
  const textures = [], materials = [];
  for (const row of manifest.replacements) {
    const key = `${row.group}|${row.material}`;
    if (replacements.has(key)) throw new Error(`Duplicate Cycles replacement ${key}`);
    const [asset, texture] = await Promise.all([
      gltf.loadAsync(new URL(row.file, manifestURL).href),
      images.loadAsync(new URL(row.radiance, manifestURL).href),
    ]);
    const material = bakedRoomMaterial(texture, manifest.rgbmRange);
    let meshes = 0;
    asset.scene.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      o.material?.dispose?.();
      o.material = material;
      o.userData.renderRoute = "baked_room";
      o.castShadow = o.receiveShadow = false;
    });
    if (!meshes) throw new Error(`Empty Cycles replacement ${key}`);
    replacements.add(key);
    group.add(asset.scene);
    textures.push(texture); materials.push(material);
  }
  return { group, replacements, textures, materials, manifest };
}
