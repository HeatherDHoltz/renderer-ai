// Frame-rate check in real Chrome on the GPU (Metal), at a Retina-size canvas.
//   node workbench/scripts/measure-fps.mjs [url] [--headed]
// Reads the page's own counter (data-fps on #render-host) while it idles,
// orbits (synthetic mouse drags), opens a jewellery case and uses the loupe.
// Headless Chrome is vsync-limited to 60 Hz; the page caps idle at 30.
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const url = process.argv.find((a) => a.startsWith("http")) || "http://127.0.0.1:4173/?fps";
const headed = process.argv.includes("--headed");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9300 + Math.floor(Math.random() * 500);
const profile = await mkdtemp(path.join(tmpdir(), "lj-fps-"));
const chrome = spawn(CHROME, [
  ...(headed ? [] : ["--headless=new"]),
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--use-angle=metal",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--window-size=1728,1117",
  "--force-device-scale-factor=2",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "about:blank",
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 50 && !ws; i++) {
  await sleep(200);
  try {
    const list = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json());
    const page = list.find((t) => t.type === "page");
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
  } catch {}
}
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send("Page.enable");
await send("Page.navigate", { url });
const t0 = Date.now();
while (!(await evaluate(`document.getElementById("viewer")?.dataset.ready === "true"`))) {
  if (Date.now() - t0 > 180000) throw new Error("page did not become ready");
  await sleep(500);
}
const loadSeconds = (Date.now() - t0) / 1000;
const info = await evaluate(`(() => { const h = document.getElementById("render-host");
  const c = h.querySelector("canvas"); return { canvas: c.width + "x" + c.height, dpr: devicePixelRatio,
  gpu: (() => { const gl = c.getContext("webgl2"); const e = gl.getExtension("WEBGL_debug_renderer_info");
    return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; })() }; })()`);
// EVAL: optional expression run once the page is ready (profiling toggles).
if (process.env.EVAL) await evaluate(process.env.EVAL);
await sleep(4000);

async function sample(seconds, during) {
  const values = [];
  const stop = Date.now() + seconds * 1000;
  let k = 0;
  while (Date.now() < stop) {
    if (during) await during(k++);
    else await sleep(100);
    if (k % 10 === 0 || !during) {
      const f = Number(await evaluate(`document.getElementById("render-host").dataset.fps`));
      if (Number.isFinite(f)) values.push(f);
    }
  }
  values.sort((a, b) => a - b);
  return { min: values[0], median: values[Math.floor(values.length / 2)], n: values.length };
}
const mouse = (type, x, y, buttons = 1) =>
  send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, clickCount: 1 });
const results = { url, loadSeconds, ...info };
results.idle = await sample(6);
if (process.env.ONLY === "orbit") {
  await mouse("mousePressed", 860, 520);
  results.orbit = await sample(6, async (k) => {
    await mouse("mouseMoved", 860 + 220 * Math.sin(k / 12), 520 + 60 * Math.cos(k / 17));
    await sleep(16);
  });
  console.log(JSON.stringify({ orbit: results.orbit, idle: results.idle }));
  chrome.kill();
  process.exit(0);
}
await mouse("mousePressed", 860, 520);
results.orbit = await sample(6, async (k) => {
  await mouse("mouseMoved", 860 + 220 * Math.sin(k / 12), 520 + 60 * Math.cos(k / 17));
  await sleep(16);
});
await mouse("mouseReleased", 860, 520, 0);
await evaluate(`[...document.querySelectorAll("button")].find(b => /stone box/i.test(b.textContent))?.click()`);
await sleep(3000);
results.caseOpen = await sample(5);
await evaluate(`document.getElementById("exit-box")?.click()`);
await sleep(2500);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "3", text: "3" });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "3" });
await sleep(2500);
results.loupeIdle = await sample(5);
await mouse("mousePressed", 860, 520);
results.loupeDrag = await sample(5, async (k) => {
  await mouse("mouseMoved", 860 + 120 * Math.sin(k / 10), 520 + 40 * Math.cos(k / 13));
  await sleep(16);
});
await mouse("mouseReleased", 860, 520, 0);
console.log(JSON.stringify(results, null, 1));
ws.close();
chrome.kill();
process.exit(0);
