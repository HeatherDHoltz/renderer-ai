const $ = (id) => document.getElementById(id);
const state = {
  gem: "tiger",
  metal: "gold",
  setting: "ring",
  finish: 14,
  angle: 45,
  height: 45,
  source: "penlight",
  background: "green",
  tool: "turn",
  auto: false,
  zoom: 2,
  loupeX: 0.5,
  loupeY: 0.35,
};
const names = { tiger: "Tiger’s eye", diamond: "Diamond", emerald: "Emerald" };
const host = $("render-host"),
  viewer = $("viewer");
let app,
  failed = false,
  dragging = false;

function announce(text) {
  $("announcement").textContent = text;
}
function choose(attribute, value) {
  document.querySelectorAll(`[data-${attribute}]`).forEach((button) => {
    if (button.tagName !== "BUTTON") return;
    const selected = button.dataset[attribute] === value;
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("selected", selected);
    if (attribute === "tool") button.classList.toggle("active", selected);
  });
}
function description() {
  const text = {
    tiger: [
      "Find the little ribbon of light.",
      "Move the penlight across the tiger’s eye and watch its silky band follow.",
    ],
    diamond: [
      "Every facet has a different good side.",
      "Turn the stone and watch its faces alternate between bright reflections and clear transmission.",
    ],
    emerald: [
      "Look for the deeper green.",
      "Light travels farther through thicker parts of the stone, giving the color more depth.",
    ],
  }[state.gem];
  if (state.tool === "loupe") {
    text[0] = "A little closer, a little more to see.";
    text[1] =
      state.gem === "tiger"
        ? "Turn the stone inside the loupe to inspect its fine, flowing fibers."
        : "Turn the stone inside the loupe and inspect how neighboring facets catch the light.";
  }
  if (state.source === "softbox" && state.tool !== "loupe") {
    text[0] = "A softer kind of sparkle.";
    text[1] =
      "The broad softbox makes wider reflections. Try it on both the stone and its metal setting.";
  }
  const p = $("discovery-text");
  p.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = text[0] + " ";
  p.append(strong, document.createTextNode(text[1]));
}
function updateLoupe() {
  $("loupe-zoom").textContent = `${Number(state.zoom.toFixed(1))}×`;
  $("loupe-less").disabled = state.zoom <= 2;
  $("loupe-more").disabled = state.zoom >= 6;
  app?.setLoupe(0, 0, state.zoom);
}
function updateLabels() {
  $("scene-name").textContent =
    `${names[state.gem].toUpperCase()}${state.setting === "ring" ? " & " + state.metal.toUpperCase() : " · LOOSE STONE"}`;
  $("light-angle").value = state.angle;
  $("light-height").value = state.height;
  $("light-value").textContent = state.angle + "°";
  $("height-value").textContent = state.height + "°";
  $("finish-value").textContent =
    state.finish < 28 ? "Polished" : state.finish < 65 ? "Satin" : "Brushed";
  $("auto-turn").setAttribute("aria-pressed", String(state.auto));
  viewer.dataset.tool = state.tool;
  viewer.dataset.background = state.background;
  $("exit-loupe").hidden = state.tool !== "loupe";
  $("mode-label").textContent =
    state.tool === "loupe" ? "THROUGH THE LOUPE" : "AT THE BENCH";
  $("loupe-controls").hidden = state.tool !== "loupe";
  $("tray-tip").hidden = state.tool === "loupe";
  const hint = {
    turn: "Drag the jewelry to turn it · scroll to bring it closer",
    light: "Drag across the bench to move the light",
    loupe: "Drag to turn the stone · scroll to magnify",
  }[state.tool];
  $("interaction-hint").textContent = hint;
  document
    .querySelectorAll("[data-metal]")
    .forEach((b) => (b.disabled = state.setting === "loose"));
  $("finish").disabled = state.setting === "loose";
  description();
  updateLoupe();
}
function setTool(value) {
  state.tool = value;
  state.auto = false;
  choose("tool", value);
  app?.setAutoTurn(false);
  app?.setTool(value);
  updateLabels();
  announce(
    `${value === "turn" ? "Turn" : value === "light" ? "Penlight" : "Loupe"} selected. ${value === "loupe" ? "Drag to turn the jewelry inside the eyepiece. Escape returns to the bench." : ""}`,
  );
}
function updateLight() {
  app?.setLight(state.angle, state.height);
  updateLabels();
}
for (const button of document.querySelectorAll("[data-gem]"))
  button.addEventListener("click", () => {
    state.gem = button.dataset.gem;
    choose("gem", state.gem);
    app?.setGem(state.gem);
    updateLabels();
    announce(names[state.gem] + " selected.");
  });
for (const button of document.querySelectorAll("[data-metal]"))
  button.addEventListener("click", () => {
    state.metal = button.dataset.metal;
    choose("metal", state.metal);
    app?.setMetal(state.metal);
    updateLabels();
    announce(state.metal + " setting selected.");
  });
for (const button of document.querySelectorAll("[data-setting]"))
  button.addEventListener("click", () => {
    state.setting = button.dataset.setting;
    state.loupeY = state.setting === "ring" ? 0.35 : 0.49;
    choose("setting", state.setting);
    app?.setSetting(state.setting);
    updateLabels();
    announce(
      state.setting === "ring"
        ? "Stone placed in its ring."
        : "Loose stone selected.",
    );
  });
for (const button of document.querySelectorAll("[data-source]"))
  button.addEventListener("click", () => {
    state.source = button.dataset.source;
    choose("source", state.source);
    app?.setSource(state.source);
    updateLabels();
    announce(state.source + " selected.");
  });
for (const button of document.querySelectorAll("[data-background]"))
  button.addEventListener("click", () => {
    state.background = button.dataset.background;
    choose("background", state.background);
    app?.setBackground(state.background);
    updateLabels();
  });
for (const button of document.querySelectorAll("[data-tool]"))
  button.addEventListener("click", () => setTool(button.dataset.tool));
$("finish").addEventListener("input", (event) => {
  state.finish = Number(event.target.value);
  app?.setFinish(state.finish);
  updateLabels();
});
$("light-angle").addEventListener("input", (event) => {
  state.angle = Number(event.target.value);
  updateLight();
});
$("light-height").addEventListener("input", (event) => {
  state.height = Number(event.target.value);
  updateLight();
});
$("loupe-more").addEventListener("click", () => {
  state.zoom = Math.min(6, state.zoom + 1);
  updateLoupe();
  announce(`Loupe magnification ${state.zoom} times.`);
});
$("loupe-less").addEventListener("click", () => {
  state.zoom = Math.max(2, state.zoom - 1);
  updateLoupe();
  announce(`Loupe magnification ${state.zoom} times.`);
});
$("reset-view").addEventListener("click", () => {
  state.auto = false;
  app?.setAutoTurn(false);
  app?.reset();
  state.loupeX = 0.5;
  state.loupeY = state.setting === "ring" ? 0.35 : 0.49;
  updateLabels();
  announce("View reset.");
});
$("auto-turn").addEventListener("click", () => {
  const next = !state.auto;
  if (next && state.tool !== "turn") setTool("turn");
  state.auto = next;
  app?.setAutoTurn(next);
  updateLabels();
  announce(next ? "Slow turn started." : "Slow turn paused.");
});
$("save-photo").addEventListener("click", async () => {
  if (!app) return;
  const button = $("save-photo");
  button.disabled = true;
  try {
    const blob = await app.photo();
    if (!blob) throw new Error("Image export unavailable");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `little-jeweler-${state.gem}-${state.setting}-${state.metal}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    announce("Photo saved.");
  } catch {
    announce("The photo could not be saved. Please try again.");
  } finally {
    button.disabled = false;
  }
});
let lastPoint = { x: 0, y: 0 };
const pointers = new Map();
let pinchDistance = 0;
function point(event) {
  const rect = host.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
  };
}
function changeMagnification(amount) {
  state.zoom = Math.max(2, Math.min(6, state.zoom + amount));
  updateLoupe();
}
function distance() {
  const p = [...pointers.values()];
  return p.length === 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
}
host.addEventListener("pointerdown", (event) => {
  dragging = true;
  lastPoint = { x: event.clientX, y: event.clientY };
  pointers.set(event.pointerId, lastPoint);
  pinchDistance = distance();
  state.auto = false;
  app?.setAutoTurn(false);
  updateLabels();
  host.setPointerCapture(event.pointerId);
  host.focus({ preventScroll: true });
  if (state.tool === "light") moveLight(event);
});
host.addEventListener("pointermove", (event) => {
  if (!dragging || !app) return;
  const next = { x: event.clientX, y: event.clientY };
  pointers.set(event.pointerId, next);
  if (pointers.size === 2) {
    const d = distance();
    if (pinchDistance) {
      if (state.tool === "loupe")
        changeMagnification((d - pinchDistance) * 0.015);
      else app.zoom(d > pinchDistance ? 0.9 : 1.1);
    }
    pinchDistance = d;
    lastPoint = next;
    return;
  }
  if (state.tool === "light") moveLight(event);
  else
    app.rotate((next.x - lastPoint.x) * 0.008, (next.y - lastPoint.y) * 0.008);
  lastPoint = next;
});
function release(event) {
  pointers.delete(event.pointerId);
  dragging = pointers.size > 0;
  pinchDistance = 0;
  if (dragging) lastPoint = [...pointers.values()][0];
}
host.addEventListener("pointerup", release);
host.addEventListener("pointercancel", release);
host.addEventListener("lostpointercapture", release);
function moveLight(event) {
  const p = point(event);
  state.angle = Math.round(Math.max(-180, Math.min(180, (p.x - 0.5) * 360)));
  state.height = Math.round(Math.max(8, Math.min(85, 85 - p.y * 77)));
  updateLight();
}
host.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    if (!app) return;
    if (state.tool === "loupe")
      changeMagnification(event.deltaY < 0 ? 0.2 : -0.2);
    else app.zoom(event.deltaY < 0 ? 0.9 : 1.1);
  },
  { passive: false },
);
host.addEventListener("keydown", (event) => {
  if (!app) return;
  const arrows = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  if (arrows[event.key]) {
    event.preventDefault();
    const [dx, dy] = arrows[event.key];
    if (state.tool === "light") {
      state.angle = Math.max(-180, Math.min(180, state.angle + dx * 5));
      state.height = Math.max(8, Math.min(85, state.height - dy * 5));
      updateLight();
    } else app.rotate(dx * 0.12, dy * 0.12);
  }
  if (["+", "=", "-", "_"].includes(event.key)) {
    event.preventDefault();
    const more = event.key === "+" || event.key === "=";
    if (state.tool === "loupe") changeMagnification(more ? 1 : -1);
    else app.zoom(more ? 0.9 : 1.1);
  }
  if (event.key === "Home") {
    event.preventDefault();
    $("reset-view").click();
  }
});
document.addEventListener("keydown", (event) => {
  if (
    $("notes-dialog").open ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.target.closest("input,textarea,select")
  )
    return;
  const tool = { 1: "turn", 2: "light", 3: "loupe" }[event.key];
  if (tool) {
    setTool(tool);
    host.focus({ preventScroll: true });
  }
  if (event.key === "Escape") {
    if (!$("cabinet").hidden) setDrawer(false);
    else if (state.tool !== "turn") setTool("turn");
  }
});

const notes = $("notes-dialog");
function openNotes() {
  app?.pause(true);
  if (state.auto) {
    state.auto = false;
    app?.setAutoTurn(false);
    updateLabels();
  }
  notes.showModal();
}
for (const id of ["open-notes", "error-gallery"])
  $(id).addEventListener("click", openNotes);
$("close-notes").addEventListener("click", () => notes.close());
notes.addEventListener("click", (event) => {
  if (event.target !== notes) return;
  const rect = notes.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    notes.close();
});
$("retry-render").addEventListener("click", () => location.reload());
function fatal(error) {
  if (failed) return;
  failed = true;
  $("loading").hidden = true;
  $("render-error").hidden = false;
  $("render-error-text").textContent =
    "This workbench needs WebGL 2 graphics. Try reloading in a browser with hardware acceleration enabled. The offline render gallery is still available.";
  console.error("Workbench initialization:", error);
  app?.dispose();
  $("auto-turn").disabled = true;
  $("save-photo").disabled = true;
  announce("The 3D workbench could not open. The render gallery is available.");
}
async function boot() {
  try {
    const { createWorkbench } = await import("./scene.js");
    app = await createWorkbench(host, fatal);
    if (failed) {
      app.dispose();
      return;
    }
    app.renderer.debug.onShaderError = () =>
      fatal(new Error("GPU material compilation failed"));
    app.setGem(state.gem);
    app.setMetal(state.metal);
    app.setSetting(state.setting);
    app.setFinish(state.finish);
    app.setSource(state.source);
    app.setLight(state.angle, state.height);
    app.setBackground(state.background);
    app.setTool(state.tool);
    app.setAutoTurn(state.auto);
    if (notes.open) app.pause(true);
    updateLabels();
    $("loading").hidden = true;
    viewer.dataset.ready = "true";
  } catch (error) {
    fatal(error);
  }
}
function setDrawer(open) {
  $("cabinet").hidden = !open;
  $("toggle-cabinet").setAttribute("aria-expanded", String(open));
  (open ? $("close-cabinet") : $("toggle-cabinet")).focus();
}
$("toggle-cabinet").addEventListener("click", () =>
  setDrawer($("cabinet").hidden),
);
$("close-cabinet").addEventListener("click", () => {
  setDrawer(false);
  $("toggle-cabinet").focus();
});
$("exit-loupe").addEventListener("click", () => setTool("turn"));
notes.addEventListener("close", () => {
  app?.pause(false);
  $("open-notes").focus();
});

updateLabels();
boot();
