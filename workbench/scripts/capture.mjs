// Full-resolution screenshot of the live page once it is ready.
//   node workbench/scripts/capture.mjs <url> <out.png> [width height scale]
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const [url, out, w = "1280", h = "720", scale = "1"] = process.argv.slice(2);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9800 + Math.floor(Math.random() * 150);
const profile = await mkdtemp(path.join(tmpdir(), "lj-cap-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--use-angle=metal",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--hide-scrollbars",
  `--window-size=${w},${h}`,
  `--force-device-scale-factor=${scale}`,
  "about:blank",
]);
process.on("exit", () => chrome.kill());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 50 && !ws; i++) {
  await sleep(200);
  try {
    const page = (await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json())).find((t) => t.type === "page");
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
  } catch {}
}
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
const logs = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  } else if (m.method === "Runtime.consoleAPICalled" && /warn|error/.test(m.params.type))
    logs.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
  else if (m.method === "Runtime.exceptionThrown") logs.push(m.params.exceptionDetails.exception?.description);
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value;
await send("Runtime.enable");
await send("Page.enable");
// --window-size includes Chrome's window frame. Set the content viewport
// explicitly so a requested 1280×720 capture really matches the Cycles frame.
await send("Emulation.setDeviceMetricsOverride", {
  width: Number(w), height: Number(h), deviceScaleFactor: Number(scale), mobile: false,
});
await send("Page.navigate", { url });
const t0 = Date.now();
while (!(await evaluate(`document.getElementById("viewer")?.dataset.ready === "true" || ["static", "fallback"].includes(document.getElementById("viewer")?.dataset.mode)`))) {
  if (Date.now() - t0 > 180000) throw new Error("Page did not become ready within 180 seconds");
  await sleep(500);
}
if (!(await evaluate('document.getElementById("viewer")?.dataset.ready === "true"')) && process.env.ALLOW_STATIC !== '1')
  throw new Error('WebGL initialization failed; refusing to capture a fallback poster as room evidence. ' + logs.slice(-2).join(' '));
await sleep(Number(process.env.SETTLE || 4000));
if (process.env.EVAL) await evaluate(process.env.EVAL), await sleep(3000);
// WHEEL=n scrolls out n ticks (zoom out); DRAG=dx,dy orbits by a mouse drag.
for (let i = 0; i < Number(process.env.WHEEL || 0); i++) {
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: Number(w) / 2, y: Number(h) / 2, deltaX: 0, deltaY: Number(process.env.WHEEL_DY || -120) });
  await sleep(60);
}
if (process.env.DRAG) {
  const [dx, dy] = process.env.DRAG.split(",").map(Number);
  const x0 = Number(w) / 2, y0 = Number(h) / 2;
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: x0, y: y0, button: "left", buttons: 1, clickCount: 1 });
  for (let k = 1; k <= 20; k++) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0 + (dx * k) / 20, y: y0 + (dy * k) / 20, button: "left", buttons: 1 });
    await sleep(30);
  }
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x0 + dx, y: y0 + dy, button: "left", buttons: 0, clickCount: 1 });
}
if (process.env.WHEEL || process.env.DRAG) await sleep(Number(process.env.SETTLE2 || 4000));
// EVAL_AFTER: an expression evaluated after the camera moves; its value is printed.
if (process.env.EVAL_AFTER) console.log("EVAL_AFTER", JSON.stringify((await send("Runtime.evaluate", { expression: process.env.EVAL_AFTER, awaitPromise: true, returnByValue: true })).result?.result?.value));
// Hide overlays without changing layout/camera when comparing rendered pixels.
// In particular the reset control can contaminate a clock colour sample.
const clean = process.env.CLEAN === "1";
if (clean) await evaluate(`(() => {
  const style = document.createElement("style");
  style.textContent = ".site-header,.scene-label,.viewer-tools,.viewer-bottom,.tool-tray,#object-hint{visibility:hidden!important} .viewer::after{opacity:0!important}";
  document.head.append(style);
})()`);
const fatal = logs.filter(s=>/Shader Error|GPU material compilation failed|Workbench initialization:|INVALID_OPERATION/.test(s));
if (fatal.length && process.env.ALLOW_STATIC !== '1') throw new Error('GPU capture rejected: ' + fatal.slice(-2).join(' '));
const shot = await send("Page.captureScreenshot", { format: "png" });
const png = Buffer.from(shot.result.data, "base64");
const dimensions = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
if (dimensions.width !== Math.round(Number(w) * Number(scale)) || dimensions.height !== Math.round(Number(h) * Number(scale)))
  throw new Error(`Unexpected screenshot dimensions: ${JSON.stringify(dimensions)}`);
const viewport = await evaluate(`({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,
  ready:document.getElementById("viewer")?.dataset.ready,
  canvases:[...document.querySelectorAll("canvas")].map(c=>({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight}))})`);
const sceneState = await evaluate(`(() => {
  const r = globalThis.__railcar;
  if (!r?.camera) return null;
  return {
    coordinates: "app: x, y-up, z",
    manifestHash:r.manifestHash || null,
    sourceHash:r.manifest?.source?.sha256 || null,
    bakeModes:Object.fromEntries(Object.entries(r.manifest?.groups || {}).map(([name,g])=>
      [name,[...new Set(Object.values(g.materials).map(m=>m.bakedResponseMode || 'RGBM irradiance/live specular'))]])),
    camera: { position:r.camera.position.toArray(), quaternion:r.camera.quaternion.toArray(),
      fov:r.camera.fov, aspect:r.camera.aspect, view:r.camera.view,
      projection:r.camera.projectionMatrix.toArray() },
    orbit: r.orbit ? { target:r.orbit.target.toArray(), radius:r.orbit.spherical.radius,
      theta:r.orbit.spherical.theta, phi:r.orbit.spherical.phi } : null,
    cases:Object.fromEntries(Object.entries(r.bench?.cases || {}).map(([id,c])=>
      [id,{progress:c.progress,destination:c.destination}]))
  };
})()`);
const evidence = { out, url, clean, seconds: (Date.now() - t0) / 1000, dimensions, viewport, sceneState, logs: logs.slice(0, 20) };
await writeFile(out, png);
await writeFile(out + ".json", JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence));
ws.close();
chrome.kill();
process.exit(0);
