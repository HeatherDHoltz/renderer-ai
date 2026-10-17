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
await send("Page.navigate", { url });
const t0 = Date.now();
while (!(await evaluate(`document.getElementById("viewer")?.dataset.ready === "true" || document.body.classList.contains("static-mode")`))) {
  if (Date.now() - t0 > 180000) break;
  await sleep(500);
}
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
const shot = await send("Page.captureScreenshot", { format: "png" });
await writeFile(out, Buffer.from(shot.result.data, "base64"));
console.log(JSON.stringify({ out, seconds: (Date.now() - t0) / 1000, logs: logs.slice(0, 20) }));
ws.close();
chrome.kill();
process.exit(0);
