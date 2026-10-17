import * as THREE from "../vendor/three.module.js";
import { HDRLoader } from "../vendor/addons/loaders/HDRLoader.js";

export async function loadSurfaces(renderer) {
  const loader = new THREE.TextureLoader();
  const load = async (name, color = false, repeat = 1, flipY = true) => {
    const t = await loader.loadAsync(
      new URL(`../assets/materials/${name}`, import.meta.url).href,
    );
    t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.flipY = flipY;
    return t;
  };
  const [
    velvetColor,
    velvetNormal,
    velvetRough,
    velvetAO,
    woodColor,
    woodNormal,
    woodRough,
    hdr,
    forest,
  ] = await Promise.all([
    load("velvet-color.jpg", true, 2),
    load("velvet-normal.jpg", false, 2),
    load("velvet-roughness.jpg", false, 2),
    load("velvet-ao.jpg", false, 2),
    load("wood-color.jpg", true),
    load("wood-normal.jpg"),
    load("wood-roughness.jpg"),
    new HDRLoader().loadAsync(
      new URL("../assets/materials/hdri-workshop.hdr", import.meta.url).href,
    ),
    new HDRLoader().loadAsync(
      new URL("../assets/materials/window-forest.hdr", import.meta.url).href,
    ),
  ]);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer),
    environment = pmrem.fromEquirectangular(hdr);
  pmrem.dispose();
  const velvet = new THREE.MeshPhysicalMaterial({
    color: "#527451",
    map: velvetColor,
    normalMap: velvetNormal,
    normalScale: new THREE.Vector2(0.2, 0.2),
    roughnessMap: velvetRough,
    roughness: 1,
    aoMap: velvetAO,
    aoMapIntensity: 0.6,
    sheen: 1,
    sheenColor: "#8aa179",
    sheenRoughness: 0.78,
  });
  // Recolor the measured red pile into cabinet green while retaining its nap.
  velvet.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      // onBeforeCompile runs before Three expands shader chunks. Editing the
      // unexpanded multiply expression left the original red dye in green felt.
      THREE.ShaderChunk.map_fragment.replace(
        "diffuseColor *= sampledDiffuseColor;",
        "sampledDiffuseColor.rgb=vec3(dot(sampledDiffuseColor.rgb,vec3(.52,.32,.16)));\n diffuseColor *= sampledDiffuseColor;",
      ),
    );
  };
  velvet.customProgramCacheKey = () => "recolored-photo-velvet-v2";
  const redVelvet = velvet.clone();
  redVelvet.color.set("#853948");
  redVelvet.sheenColor.set("#b97179");
  redVelvet.onBeforeCompile = velvet.onBeforeCompile;
  redVelvet.customProgramCacheKey = velvet.customProgramCacheKey;
  const wood = new THREE.MeshStandardMaterial({
    map: woodColor,
    normalMap: woodNormal,
    normalScale: new THREE.Vector2(0.1, 0.1),
    roughnessMap: woodRough,
    roughness: 0.7,
    color: "#82674f",
  });
  return {
    velvet,
    redVelvet,
    wood,
    forest,
    hdr,
    environment,
    dispose() {
      environment.dispose();
      hdr.dispose();
      forest.dispose();
      for (const t of [
        velvetColor,
        velvetNormal,
        velvetRough,
        velvetAO,
        woodColor,
        woodNormal,
        woodRough,
      ])
        t.dispose();
    },
  };
}
