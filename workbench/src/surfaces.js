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
    t.anisotropy = renderer.capabilities.getMaxAnisotropy() > 4 ? 4 : 2;
    t.flipY = flipY;
    return t;
  };
  const [
    velvetColor,
    velvetNormal,
    velvetRough,
    velvetAO,
    plasterColor,
    plasterNormal,
    plasterRough,
    tableNormal,
    tableARM,
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
    load("plaster-color.jpg", true, 3),
    load("plaster-normal.jpg", false, 3),
    load("plaster-roughness.jpg", false, 3),
    load("table-normal.jpg", false, 1, false),
    load("table-arm.jpg", false, 1, false),
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
    color: "#315b45",
    map: velvetColor,
    normalMap: velvetNormal,
    normalScale: new THREE.Vector2(0.2, 0.2),
    roughnessMap: velvetRough,
    roughness: 1,
    aoMap: velvetAO,
    aoMapIntensity: 0.6,
    sheen: 1,
    sheenColor: "#527f59",
    sheenRoughness: 0.78,
  });
  // Recolor the measured red pile into cabinet green while retaining its nap.
  velvet.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "diffuseColor *= sampledDiffuseColor;",
      "sampledDiffuseColor.rgb=vec3(dot(sampledDiffuseColor.rgb,vec3(.52,.32,.16)));\n diffuseColor *= sampledDiffuseColor;",
    );
  };
  velvet.customProgramCacheKey = () => "recolored-photo-velvet-v1";
  const plaster = new THREE.MeshStandardMaterial({
    color: "#b8a787",
    map: plasterColor,
    normalMap: plasterNormal,
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughnessMap: plasterRough,
    roughness: 1,
  });
  const wood = new THREE.MeshStandardMaterial({
    map: woodColor,
    normalMap: woodNormal,
    normalScale: new THREE.Vector2(0.25, 0.25),
    roughnessMap: woodRough,
    roughness: 0.7,
    color: "#b99575",
  });
  return {
    velvet,
    plaster,
    wood,
    forest,
    tableNormal,
    tableARM,
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
        plasterColor,
        plasterNormal,
        plasterRough,
        tableNormal,
        tableARM,
        woodColor,
        woodNormal,
        woodRough,
      ])
        t.dispose();
    },
  };
}
