import * as THREE from "../vendor/three.module.js";

// Browser rebuilds of the railcar's Blender materials (export.py manifest v2).
//
// Light is baked: each group has an RGBM irradiance lightmap and an RGBM
// emission map on its own packed UV. Surfaces are NOT baked: every material
// is shaded from its source textures at full resolution, the way Cycles does.
//   box       Poly Haven photo textures, box-projected (Cycles BOX, blend .25)
//             in world or object space, tinted, with roughness + normal maps
//   damask    Lincrusta frieze / stencilled ceiling: a mask in world space
//   gilt      water gilding: noisy burnished/matte gold
//   metal     brass, nickel, silver, iron: colour + noisy roughness
//   artglass  leaded quarry glazing of the clerestory, self-lit
//   bindings  library book spines: palette, gilt bands, labels, page edges
//   uvbake    UV-mapped materials baked onto their own UVs (colour/ORM/normal)
//   atlas     leftovers baked into a small per-group atlas
//   plain     constants

// Blender (x, y, z) -> app (x, z, -y), so app -> Blender is (x, -z, y).
const COMMON_PARS = /* glsl */ `
varying vec3 ljPos;
varying vec3 ljNrm;
#ifdef LJ_OBJECT
varying vec3 ljObj;
varying vec3 ljObjN;
#endif
#ifdef LJ_BINDINGS
varying vec3 ljGen;
varying float ljRand;
#endif
uniform float ljRgbm;
vec3 ljBlender(vec3 v) { return vec3(v.x, -v.z, v.y); }
vec3 ljApp(vec3 v) { return vec3(v.x, v.z, -v.y); }
float ljHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float ljValueNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ljHash(i), ljHash(i + vec3(1, 0, 0)), f.x),
                 mix(ljHash(i + vec3(0, 1, 0)), ljHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(ljHash(i + vec3(0, 0, 1)), ljHash(i + vec3(1, 0, 1)), f.x),
                 mix(ljHash(i + vec3(0, 1, 1)), ljHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// Roughly Blender's Noise Texture "Fac": fBm centred on 0.5.
float ljNoise(vec3 x, int octaves) {
  float a = 0.5, s = 0.0, w = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    s += a * ljValueNoise(x);
    w += a;
    x *= 2.03;
    a *= 0.5;
  }
  return s / w;
}
`;

const BOX_PARS = /* glsl */ `
uniform sampler2D ljColorMap;
uniform sampler2D ljRoughMap;
uniform sampler2D ljNormalMap;
uniform float ljScale;
uniform vec3 ljTint;
uniform float ljRoughMul;
uniform float ljRoughAdd;
uniform float ljNormalStrength;
uniform int ljRoughChannel;
struct LjBox { vec2 uv[3]; vec3 w; vec3 tu[3]; vec3 tv[3]; };
// Cycles' image BOX projection: per-axis UVs with mirrored U on two faces.
LjBox ljBoxSetup(vec3 co, vec3 n) {
  LjBox b;
  vec3 a = pow(abs(n), vec3(6.0));
  b.w = a / max(a.x + a.y + a.z, 1e-5);
  float sx = n.x < 0.0 ? -1.0 : 1.0;
  float sy = n.y > 0.0 ? -1.0 : 1.0;
  float sz = n.z > 0.0 ? -1.0 : 1.0;
  b.uv[0] = vec2(n.x < 0.0 ? 1.0 - co.y : co.y, co.z);
  b.uv[1] = vec2(n.y > 0.0 ? 1.0 - co.x : co.x, co.z);
  b.uv[2] = vec2(n.z > 0.0 ? 1.0 - co.y : co.y, co.x);
  b.tu[0] = vec3(0, sx, 0); b.tv[0] = vec3(0, 0, 1);
  b.tu[1] = vec3(sy, 0, 0); b.tv[1] = vec3(0, 0, 1);
  b.tu[2] = vec3(0, sz, 0); b.tv[2] = vec3(1, 0, 0);
  return b;
}
vec4 ljBoxSample(sampler2D t, LjBox b) {
  vec4 c = vec4(0.0);
  if (b.w.x > 0.002) c += texture2D(t, b.uv[0]) * b.w.x;
  if (b.w.y > 0.002) c += texture2D(t, b.uv[1]) * b.w.y;
  if (b.w.z > 0.002) c += texture2D(t, b.uv[2]) * b.w.z;
  return c;
}
vec3 ljBoxNormal(LjBox b, vec3 n) {
  vec3 r = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float w = i == 0 ? b.w.x : (i == 1 ? b.w.y : b.w.z);
    if (w <= 0.002) continue;
    vec3 t = texture2D(ljNormalMap, b.uv[i]).xyz * 2.0 - 1.0;
    t.xy *= ljNormalStrength;
    r += normalize(b.tu[i] * t.x + b.tv[i] * t.y + n * t.z) * w;
  }
  return normalize(r);
}
`;

const DAMASK_PARS = /* glsl */ `
uniform sampler2D ljMask;
uniform vec2 ljDiv;
uniform ivec2 ljAxes;
uniform vec3 ljDark;
uniform vec3 ljLight;
uniform vec2 ljRough;
uniform float ljBump;
float ljDamask(vec3 b) {
  vec2 uv = vec2(b[ljAxes.x] / ljDiv.x, b[ljAxes.y] / ljDiv.y);
  return texture2D(ljMask, uv).r;
}
`;

function texture(loader, cache, url, srgb, aniso, flip = true) {
  const key = url + (srgb ? "|srgb" : "") + (flip ? "" : "|noflip");
  if (!cache.has(key)) {
    const t = loader.load(url);
    // Box/damask lookups use Blender's own UV convention (flipped image rows);
    // bakes on glTF UVs must not be flipped.
    t.flipY = flip;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = aniso;
    cache.set(key, t);
  }
  return cache.get(key);
}

// Box-projected (parallax-corrected) reflections of the room probe: each
// reflection ray is intersected with the car's walls before the cube lookup,
// so mirrors, brass and window glass reflect the sconces where they are.
export function boxProjection(position, min, max) {
  const uniforms = {
    ljProbePos: { value: position.clone() },
    ljBoxMin: { value: min.clone() },
    ljBoxMax: { value: max.clone() },
  };
  return {
    uniforms,
    patch(shader) {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("void main() {", "varying vec3 ljBoxWorld;\nvoid main() {")
        .replace(
          "#include <worldpos_vertex>",
          "#include <worldpos_vertex>\nljBoxWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
        );
      const chunk = THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
        "reflectVec = inverseTransformDirection( reflectVec, viewMatrix );",
        "reflectVec = inverseTransformDirection( reflectVec, viewMatrix );\n\t\treflectVec = ljBoxProject( reflectVec );",
      );
      shader.fragmentShader =
        /* glsl */ `uniform vec3 ljProbePos, ljBoxMin, ljBoxMax;
varying vec3 ljBoxWorld;
vec3 ljBoxProject(vec3 v) {
  vec3 tMax = (ljBoxMax - ljBoxWorld) / v;
  vec3 tMin = (ljBoxMin - ljBoxWorld) / v;
  vec3 t = mix(tMin, tMax, step(vec3(0.0), v));
  float f = min(min(t.x, t.y), t.z);
  return normalize(ljBoxWorld + v * max(f, 0.0) - ljProbePos);
}
` + shader.fragmentShader.replace("#include <envmap_physical_pars_fragment>", chunk);
    },
  };
}

function channelOf(ctx, key, channel) {
  ctx.channels ??= new Map();
  const id = key + channel;
  if (!ctx.channels.has(id)) {
    const t = ctx[key].clone();
    t.channel = channel;
    ctx.channels.set(id, t);
  }
  return ctx.channels.get(id);
}

const rgb = (a, fallback = [1, 1, 1]) => new THREE.Color().fromArray(a || fallback);

/**
 * spec:  manifest material recipe
 * ctx:   { base (URL prefix), loader, cache, aniso, light, emit, lightIntensity,
 *          rgbm, envMap, envIntensity(metal) , specular, group }
 */
export function railcarMaterial(name, spec, ctx) {
  const kind = spec.kind;
  const physical = (spec.sheen || 0) > 0 || (spec.coat || 0) > 0;
  const Material = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new Material({ name });
  const uniforms = { ljRgbm: { value: ctx.rgbm } };
  const defines = {};
  const tex = (path, srgb, flip = true) => texture(ctx.loader, ctx.cache, ctx.base + path, srgb, ctx.aniso, flip);
  let albedo = "", rough = "", metal = "", normal = "", emissive = "";

  if (kind === "box") {
    const maps = spec.maps;
    defines.LJ_BOX = "";
    if (spec.space === "object") defines.LJ_OBJECT = "";
    Object.assign(uniforms, {
      ljColorMap: { value: tex(maps.color, true) },
      ljRoughMap: { value: maps.rough ? tex(maps.rough, false) : null },
      ljNormalMap: { value: maps.normal ? tex(maps.normal, false) : null },
      ljScale: { value: spec.scale },
      ljTint: { value: rgb(spec.tint) },
      ljRoughMul: { value: spec.roughMul ?? 1 },
      ljRoughAdd: { value: spec.roughAdd ?? 0 },
      ljNormalStrength: { value: spec.normalStrength ?? 1 },
      ljRoughChannel: { value: spec.maps.roughChannel || 0 },
    });
    if (maps.rough) defines.LJ_ROUGH = "";
    if (maps.normal) defines.LJ_NORMAL = "";
    m.metalness = spec.metallic || 0;
    if (physical) {
      m.clearcoat = spec.coat || 0;
      m.clearcoatRoughness = spec.coatRough ?? 0.1;
      m.sheen = spec.sheen || 0;
      m.sheenColor = rgb(spec.sheenTint);
      m.sheenRoughness = 0.5;
    }
    albedo = /* glsl */ `
      #ifdef LJ_OBJECT
        vec3 ljCo = ljObj * ljScale; vec3 ljN = normalize(ljObjN);
      #else
        vec3 ljCo = ljBlender(ljPos) * ljScale; vec3 ljN = normalize(ljBlender(ljNrm));
      #endif
      LjBox ljB = ljBoxSetup(ljCo, ljN);
      diffuseColor.rgb *= ljBoxSample(ljColorMap, ljB).rgb * ljTint;`;
    rough = /* glsl */ `
      float roughnessFactor = roughness;
      #ifdef LJ_ROUGH
        vec4 ljR = ljBoxSample(ljRoughMap, ljB);
        roughnessFactor = clamp((ljRoughChannel == 1 ? ljR.g : ljR.r) * ljRoughMul + ljRoughAdd, 0.02, 1.0);
      #endif`;
    normal = /* glsl */ `
      #if defined(LJ_NORMAL) && !defined(LJ_OBJECT)
        normal = normalize((viewMatrix * vec4(ljApp(ljBoxNormal(ljB, ljN)), 0.0)).xyz);
        #ifdef DOUBLE_SIDED
          normal *= faceDirection;
        #endif
      #endif`;
  } else if (kind === "damask") {
    defines.LJ_DAMASK = "";
    Object.assign(uniforms, {
      ljMask: { value: tex(spec.mask, false) },
      ljDiv: { value: new THREE.Vector2(...spec.div) },
      ljAxes: { value: new THREE.Vector2(...spec.axes) },
      ljDark: { value: rgb(spec.dark) },
      ljLight: { value: rgb(spec.light) },
      ljRough: { value: new THREE.Vector2(...spec.rough) },
      ljBump: { value: spec.bump || 0 },
    });
    albedo = /* glsl */ `
      vec3 ljB3 = ljBlender(ljPos);
      float ljM = ljDamask(ljB3);
      diffuseColor.rgb = mix(ljDark, ljLight, ljM);`;
    rough = `float roughnessFactor = mix(ljRough.x, ljRough.y, ljM);`;
    metal = `float metalnessFactor = ljM;`;
    normal = /* glsl */ `
      if (ljBump > 0.0) {
        // Bump node: height = mask, strength ljBump, distance 0.05 (Blender units).
        float h = ljM * 0.05 * ljBump;
        vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
        float dhx = dFdx(h), dhy = dFdy(h);
        vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
        float det = dot(dpx, r1);
        vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
        normal = normalize(abs(det) * normal - grad);
      }`;
  } else if (kind === "gilt") {
    Object.assign(uniforms, {
      ljDark: { value: rgb(spec.dark) },
      ljLight: { value: rgb(spec.light) },
      ljRough: { value: new THREE.Vector2(...spec.rough) },
      ljFreq: { value: spec.noise },
    });
    defines.LJ_GILT = "";
    albedo = /* glsl */ `
      float ljF = ljNoise(ljBlender(ljPos) * ljFreq, 6);
      float ljT = smoothstep(0.3, 0.7, ljF);
      diffuseColor.rgb = mix(ljDark, ljLight, ljT);`;
    rough = `float roughnessFactor = mix(ljRough.x, ljRough.y, ljT);`;
    metal = `float metalnessFactor = 1.0;`;
  } else if (kind === "metal") {
    m.color = rgb(spec.color);
    m.metalness = 1;
    Object.assign(uniforms, { ljFreq: { value: spec.noise }, ljAmt: { value: spec.noiseAmount }, ljBase: { value: spec.rough } });
    defines.LJ_METAL = "";
    rough = `float roughnessFactor = clamp(ljBase + ljNoise(ljBlender(ljPos) * ljFreq, 3) * ljAmt, 0.03, 1.0);`;
  } else if (kind === "artglass") {
    Object.assign(uniforms, {
      ljFreq: { value: spec.freq },
      ljLead: { value: spec.lead },
      ljPaneA: { value: rgb(spec.paneA) },
      ljPaneB: { value: rgb(spec.paneB) },
      ljGlow: { value: spec.emission },
    });
    defines.LJ_ARTGLASS = "";
    m.roughness = 0.35;
    albedo = /* glsl */ `
      vec3 ljB3 = ljBlender(ljPos);
      float ljH = ljB3.x + ljB3.y;
      float ljU = (ljH + ljB3.z) * ljFreq, ljV = (ljH - ljB3.z) * ljFreq;
      float ljLd = max(step(abs(fract(ljU) - 0.5), ljLead), step(abs(fract(ljV) - 0.5), ljLead));
      vec3 ljPane = mix(ljPaneA, ljPaneB, mod(floor(ljU) + floor(ljV), 2.0));
      diffuseColor.rgb = mix(ljPane, vec3(0.015), ljLd);`;
    emissive = `totalEmissiveRadiance = ljPane * (1.0 - ljLd) * ljGlow;`;
  } else if (kind === "bindings") {
    defines.LJ_BINDINGS = "";
    const pal = spec.palette.map((c) => new THREE.Color().fromArray(c));
    Object.assign(uniforms, {
      ljPalette: { value: pal },
      ljLabel: { value: rgb(spec.label) },
      ljPaper: { value: rgb(spec.paper) },
      ljGiltC: { value: rgb(spec.gilt) },
    });
    m.clearcoat = spec.coat || 0;
    m.clearcoatRoughness = 0.3;
    albedo = /* glsl */ `
      int ljI = int(clamp(floor(ljRand * 10.0), 0.0, 9.0));
      vec3 ljCol = ljPalette[0];
      for (int i = 1; i < 10; i++) if (i == ljI) ljCol = ljPalette[i];
      float ljZ = ljGen.z, ljY = ljGen.y;
      #define LJ_BAND(c, w) step(abs(ljZ - (c)), (w))
      float ljSpine = step(ljY, 0.03);
      float ljG = max(max(LJ_BAND(0.07, 0.009), LJ_BAND(0.11, 0.004)), max(LJ_BAND(0.93, 0.009), LJ_BAND(0.89, 0.004)));
      ljG = max(ljG, max(LJ_BAND(0.36, 0.006), LJ_BAND(0.6, 0.006))) * ljSpine;
      float ljLab = step(0.72, ljZ) * step(ljZ, 0.84) * ljSpine;
      ljCol = mix(ljCol, ljLabel, ljLab);
      float ljPage = step(0.6, abs(ljNrm.y)) * step(0.05, ljY);
      ljCol = mix(ljCol, ljPaper, ljPage);
      ljCol = mix(ljCol, ljGiltC, ljG);
      diffuseColor.rgb = ljCol;`;
    rough = `float roughnessFactor = mix(0.62, 0.25, ljG);`;
    metal = `float metalnessFactor = ljG;`;
  } else if (kind === "uvbake" || kind === "atlas") {
    m.map = tex(spec.color, true, false);
    m.map.wrapS = m.map.wrapT = THREE.ClampToEdgeWrapping;
    const orm = tex(spec.orm, false, false);
    orm.wrapS = orm.wrapT = THREE.ClampToEdgeWrapping;
    m.roughnessMap = m.metalnessMap = orm;
    m.roughness = m.metalness = 1;
    if (spec.normal) {
      m.normalMap = tex(spec.normal, false, false);
      m.normalMap.wrapS = m.normalMap.wrapT = THREE.ClampToEdgeWrapping;
    }
    if (physical) {
      m.sheen = spec.sheen || 0;
      m.sheenRoughness = 0.5;
      m.clearcoat = spec.coat || 0;
      m.clearcoatRoughness = 0.15;
    }
  } else {
    m.color = rgb(spec.color, [0.5, 0.5, 0.5]);
    m.roughness = spec.roughness ?? 0.6;
    m.metalness = spec.metallic ?? 0;
    if (physical) {
      m.sheen = spec.sheen || 0;
      m.clearcoat = spec.coat || 0;
    }
  }

  // Shared: baked light (RGBM), probe reflections, live glints only.
  // The group's light/emission textures are shared; the UV channel lives on
  // the texture, so each channel gets its own clone (same GPU upload).
  m.lightMap = channelOf(ctx, "light", spec.uv ?? 0);
  m.lightMapIntensity = ctx.lightIntensity;
  if (kind !== "artglass") {
    m.emissive.set("#ffffff");
    m.emissiveMap = channelOf(ctx, "emit", spec.uv ?? 0);
  } else {
    m.emissive.set("#ffffff");
  }
  m.userData.metallic = kind === "gilt" || kind === "damask" || kind === "metal" || (spec.metallic ?? 0) > 0.5;
  m.envMap = ctx.envMap;
  m.envMapIntensity = m.metalness > 0.5 || kind === "gilt" || kind === "damask" ? ctx.metalEnv : ctx.roomEnv;
  const specular = ctx.specular;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.defines = { ...(shader.defines || {}), ...defines };
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;
    vs =
      `varying vec3 ljPos;\nvarying vec3 ljNrm;\n` +
      `#ifdef LJ_OBJECT\nattribute vec3 _lj_obj;\nattribute vec3 _lj_onrm;\nvarying vec3 ljObj;\nvarying vec3 ljObjN;\n#endif\n` +
      `#ifdef LJ_BINDINGS\nattribute vec3 _lj_gen;\nattribute float _lj_rand;\nvarying vec3 ljGen;\nvarying float ljRand;\n#endif\n` +
      vs.replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        ljPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        ljNrm = normalize(mat3(modelMatrix) * objectNormal);
        #ifdef LJ_OBJECT
          ljObj = _lj_obj; ljObjN = _lj_onrm;
        #endif
        #ifdef LJ_BINDINGS
          ljGen = _lj_gen; ljRand = _lj_rand;
        #endif`,
      );
    let pars = COMMON_PARS;
    if (defines.LJ_BOX !== undefined) pars += BOX_PARS;
    if (defines.LJ_DAMASK !== undefined) pars += DAMASK_PARS;
    if (defines.LJ_GILT !== undefined) pars += "uniform vec3 ljDark; uniform vec3 ljLight; uniform vec2 ljRough; uniform float ljFreq;\n";
    if (defines.LJ_METAL !== undefined) pars += "uniform float ljFreq; uniform float ljAmt; uniform float ljBase;\n";
    if (defines.LJ_ARTGLASS !== undefined)
      pars += "uniform float ljFreq; uniform float ljLead; uniform vec3 ljPaneA; uniform vec3 ljPaneB; uniform float ljGlow;\n";
    if (defines.LJ_BINDINGS !== undefined)
      pars += "uniform vec3 ljPalette[10]; uniform vec3 ljLabel; uniform vec3 ljPaper; uniform vec3 ljGiltC;\n";
    fs = pars + fs;
    if (albedo) fs = fs.replace("#include <map_fragment>", `#include <map_fragment>\n${albedo}`);
    if (rough) fs = fs.replace("#include <roughnessmap_fragment>", rough);
    if (metal) fs = fs.replace("#include <metalnessmap_fragment>", metal);
    if (normal) fs = fs.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${normal}`);
    // RGBM emission bake, or the procedural glow of the art glass.
    fs = fs.replace(
      "#include <emissivemap_fragment>",
      emissive ||
        `#ifdef USE_EMISSIVEMAP
          vec4 ljE = texture2D(emissiveMap, vEmissiveMapUv);
          totalEmissiveRadiance *= ljE.rgb * ljE.a * ljRgbm;
        #endif`,
    );
    // RGBM irradiance; the probe's diffuse is already in the bake.
    fs = fs.replace(
      "#include <lights_fragment_maps>",
      /* glsl */ `
      #ifdef USE_LIGHTMAP
        vec4 ljL = texture2D(lightMap, vLightMapUv);
        irradiance += ljL.rgb * ljL.a * ljRgbm * lightMapIntensity;
      #endif
      #if defined(USE_ENVMAP) && defined(RE_IndirectSpecular)
        radiance += getIBLRadiance(geometryViewDir, geometryNormal, material.roughness);
        #ifdef USE_CLEARCOAT
          clearcoatRadiance += getIBLRadiance(geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness);
        #endif
      #endif`,
    );
    fs = fs.replace(
      "#include <lights_fragment_end>",
      // ...including the varnish (clearcoat) and velvet (sheen) lobes.
      `#include <lights_fragment_end>
  reflectedLight.directDiffuse = vec3(0.0);
  reflectedLight.directSpecular *= ${specular.toFixed(3)};
  #ifdef USE_CLEARCOAT
    clearcoatSpecularDirect *= ${specular.toFixed(3)};
  #endif
  #ifdef USE_SHEEN
    sheenSpecularDirect *= ${specular.toFixed(3)};
  #endif`,
    );
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
    ctx.box?.patch(shader);
  };
  const key = `railcar-v5|${kind}|${Object.keys(defines).sort().join(",")}|${specular}|${ctx.box ? "box" : ""}`;
  m.customProgramCacheKey = () => key;
  return m;
}
