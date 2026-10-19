import * as THREE from "../vendor/three.module.js";
import { createSurfaceMaterials } from "./surface-materials.js";
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
  const { velvet, redVelvet, wood } = createSurfaceMaterials({
    velvetColor, velvetNormal, velvetRough, velvetAO, woodColor, woodNormal, woodRough,
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
