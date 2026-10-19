import * as THREE from "../vendor/three.module.js";

// Renderer-independent material construction, shared with the Cycles case
// snapshot generator. Texture loading and environment setup stay above.
export function createSurfaceMaterials({
  velvetColor, velvetNormal, velvetRough, velvetAO, woodColor, woodNormal, woodRough,
}) {
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
  return { velvet, redVelvet, wood };
}
