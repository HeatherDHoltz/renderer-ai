// Optional diagnostic build, kept entirely under ignored output/. It changes no
// production controls. Run this, then PORT=4174 node <printed path>/scripts/serve.mjs.
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const source = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(source, "../output/orbit-audit/profile-workbench");
await mkdir(output, { recursive: true });
for (const name of [
  "index.html",
  "src",
  "vendor",
  "assets",
  "scripts",
  "package.json",
])
  await cp(path.join(source, name), path.join(output, name), {
    recursive: true,
  });
function patch(text, before, after) {
  if (!text.includes(before))
    throw new Error(`Profile injection no longer matches: ${before}`);
  return text.replace(before, after);
}
const scenePath = path.join(output, "src/scene.js");
let scene = await readFile(scenePath, "utf8");
scene = patch(
  scene,
  "  RectAreaLightUniformsLib.init();",
  "  const auditFlags = new URLSearchParams(location.search);\n  RectAreaLightUniformsLib.init();",
);
scene = patch(
  scene,
  "    const ratio = devicePixelRatio || 1;",
  '    const ratio = auditFlags.has("dpr1") ? 1 : devicePixelRatio || 1;',
);
scene = patch(
  scene,
  "jewelryCache.render(jewelryDirty)",
  "jewelryCache.render(true)",
);
scene = patch(
  scene,
  "  function draw() {\n    host.dataset.jewelryDraws",
  `  let auditMode='', auditLast=0, auditSamples=[];
  function draw() {
    const mode=inspection===0?'bench':inspection===1?'loupe':'transition';
    if(mode!==auditMode){auditMode=mode;auditLast=0;auditSamples=[];}
    const now=performance.now();
    if(auditLast){auditSamples.push(now-auditLast);if(auditSamples.length>60)auditSamples.shift();}
    auditLast=now;
    const sorted=[...auditSamples].sort((a,b)=>a-b);
    host.dataset.profile=JSON.stringify({mode,samples:sorted.length,drawIntervalMedianMs:sorted[Math.floor(sorted.length/2)]||0,dpr:renderer.getPixelRatio(),canvas:[renderer.domElement.width,renderer.domElement.height],flags:[...auditFlags.keys()]});
    host.dataset.jewelryDraws`,
);
const scheduleStart = scene.indexOf(
  "    if (moving || objectsMoving || caustics.settling) requestFrame();",
);
const scheduleEnd = scene.indexOf(
  "\n  }\n  function requestFrame",
  scheduleStart,
);
if (scheduleStart < 0 || scheduleEnd < 0)
  throw new Error("Diagnostic frame hook moved");
scene =
  scene.slice(0, scheduleStart) +
  "    requestFrame();" +
  scene.slice(scheduleEnd);
await writeFile(scenePath, scene);
const opticsPath = path.join(output, "src/gem-optics.js");
let optics = await readFile(opticsPath, "utf8");
optics = patch(
  optics,
  "${facetBVHGLSL(hierarchy.nodes.length)}",
  '${new URLSearchParams(location.search).has("planes") ? convexOpticsGLSL(planes.length).slice(convexOpticsGLSL(planes.length).indexOf("      float exitFacet")) : facetBVHGLSL(hierarchy.nodes.length)}',
);
await writeFile(opticsPath, optics);
console.log(
  `Diagnostic source: ${output}\nOpen / for native-resolution full redraws; use /?dpr1 for an explicit diagnostic resolution and add &planes for the full facet scan.\nUse controls to enter/exit loupe. Read #render-host data-profile after 60 steady draws. Stop the server and close the tab after measuring; this build deliberately draws continuously.`,
);
