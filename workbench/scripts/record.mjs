// Record the live page for review: frames streamed from Chrome (Metal GPU).
//   node workbench/scripts/record.mjs <url> <outDir> [seconds] [w h]
// Env: DRAG=dx,dy turns the view first (large values clamp at the orbit limits).
// Writes outDir/frame-00000.jpg ... plus frames.json (timestamps) and
// measured fps from the page's own counter during the recording.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const [url, outDir, seconds = "60", w = "1280", h = "720"] = process.argv.slice(2);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9600 + Math.floor(Math.random() * 150);
const profile = await mkdtemp(path.join(tmpdir(), "lj-rec-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--use-angle=metal",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--hide-scrollbars",
  `--window-size=${w},${h}`,
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "about:blank",
]);
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
const frames = [];
let recording = false;
await mkdir(outDir, { recursive: true });
ws.addEventListener("message", async (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  } else if (m.method === "Page.screencastFrame") {
    const { data, metadata, sessionId } = m.params;
    ws.send(JSON.stringify({ id: ++id, method: "Page.screencastFrameAck", params: { sessionId } }));
    if (!recording) return;
    const n = frames.length;
    frames.push(metadata.timestamp);
    await writeFile(path.join(outDir, `frame-${String(n).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value;
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url });
const t0 = Date.now();
while (!(await evaluate(`document.getElementById("viewer")?.dataset.ready === "true"`))) {
  if (Date.now() - t0 > 180000) throw new Error("not ready");
  await sleep(500);
}
await sleep(3000);
if (process.env.DRAG) {
  const [dx, dy] = process.env.DRAG.split(",").map(Number);
  const x0 = Number(w) / 2, y0 = Number(h) / 2;
  const mouse = (type, x, y, buttons = 1) =>
    send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, clickCount: 1 });
  await mouse("mousePressed", x0, y0);
  for (let k = 1; k <= 30; k++) {
    await mouse("mouseMoved", x0 + (dx * k) / 30, y0 + (dy * k) / 30);
    await sleep(25);
  }
  await mouse("mouseReleased", x0 + dx, y0 + dy, 0);
  await sleep(3000);
}
// Hide the interface so only the scene is recorded.
await evaluate(`document.querySelectorAll(".site-header,.viewer-bottom,.tool-tray,.header-note,#object-hint").forEach(e=>e.style.visibility="hidden")`);
const fps = [];
recording = true;
await send("Page.startScreencast", { format: "jpeg", quality: 85, everyNthFrame: 1 });
const end = Date.now() + Number(seconds) * 1000;
while (Date.now() < end) {
  await sleep(1000);
  const f = Number(await evaluate(`document.getElementById("render-host").dataset.fps`));
  if (Number.isFinite(f)) fps.push(f);
}
recording = false;
await send("Page.stopScreencast");
await sleep(500);
await writeFile(path.join(outDir, "frames.json"), JSON.stringify({ url, seconds: Number(seconds), timestamps: frames, pageFps: fps }));
fps.sort((a, b) => a - b);
console.log(JSON.stringify({ outDir, frames: frames.length, fpsMedian: fps[Math.floor(fps.length / 2)], fpsMin: fps[0] }));
ws.close();
chrome.kill();
process.exit(0);
