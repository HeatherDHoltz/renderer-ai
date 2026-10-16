// Only the inspected jewelry consumes the moving room/lamp capture. Applying
// it to scene.environment would step all diffuse room lighting at probe rate.
export function specimenEnvironment(materials, roomIntensity) {
  const bindings = [...new Set(materials)].map((material) => ({
    material,
    intensity: material.envMapIntensity * roomIntensity,
  }));
  return (texture) => {
    for (const { material, intensity } of bindings) {
      if (material.envMap !== texture) {
        material.envMap = texture;
        material.needsUpdate = true;
      }
      material.envMapIntensity = intensity;
    }
  };
}
