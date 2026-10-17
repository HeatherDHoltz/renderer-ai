import { GEMS } from "./gems.js";
import { METALS } from "./metals.js";
import { wheelScale } from "./orbit.js";
const $ = (id) => document.getElementById(id);
const state = {
  gem: "diamond",
  box: null,
  metal: "gold",
  setting: "ring",
  finish: 14,
  angle: -20,
  height: 65,
  source: "penlight",
  background: "cream",
  tool: "explore",
  auto: false,
  caustics: true,
  zoom: 2,
  loupeX: 0.5,
  loupeY: 0.35,
};
const names = Object.fromEntries(
  Object.entries(GEMS).map(([id, g]) => [id, g.name]),
);
const host = $("render-host"),
  viewer = $("viewer");
const metalChoices = document.querySelector(
  '[role="group"][aria-label="Metal"]',
);
metalChoices.classList.add("metal-options");
metalChoices.replaceChildren(
  ...Object.entries(METALS).map(([id, m]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.metal = id;
    b.textContent = m.name;
    b.setAttribute("aria-pressed", String(id === state.metal));
    return b;
  }),
);
const gemChoices =
  document.querySelector('[role="group"][aria-label="Gemstone"]') ||
  document.querySelector("[data-gem]").parentElement;
gemChoices.classList.add("gem-options");
gemChoices.replaceChildren(
  ...Object.entries(GEMS).map(([id, g]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.gem = id;
    b.textContent = g.name;
    b.style.setProperty("--gem-color", g.swatch);
    b.setAttribute("aria-pressed", String(id === state.gem));
    return b;
  }),
);
const boxExit = document.createElement("button");
boxExit.id = "exit-box";
boxExit.className = "exit-loupe";
boxExit.hidden = true;
boxExit.textContent = "← Back to the bench · Esc";
boxExit.addEventListener("click", () => {
  state.box = null;
  app?.focusBox(null);
  updateLabels();
});
viewer.append(boxExit);
const collectionShortcuts = document.createElement("div");
collectionShortcuts.className = "collection-shortcuts";
$("cabinet").querySelector(".stone-section").before(collectionShortcuts);
for (const [id, label] of [
  ["gems", "Open the stone box"],
  ["metals", "Open the ring collection"],
]) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", () => openBox(id));
  collectionShortcuts.append(b);
}
function openBox(id) {
  if (!$("cabinet").hidden) setDrawer(false);
  state.box = id;
  state.tool = "explore";
  state.auto = false;
  app?.setAutoTurn(false);
  app?.setTool("explore");
  app?.focusBox(id);
  choose("tool", "explore");
  updateLabels();
  announce(
    id === "gems"
      ? "Stone box opened. Choose a stone from either layer."
      : "Ring collection opened. Choose an alloy and finish.",
  );
}
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
  const text = [
    state.gem === "tiger"
      ? "Find the little ribbon of light."
      : `Meet ${names[state.gem].toLowerCase()}.`,
    GEMS[state.gem].note,
  ];
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
      "The broad light makes wider reflections. Try it on both the stone and its metal setting.";
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
    `${names[state.gem].toUpperCase()}${state.setting === "ring" ? " & " + METALS[state.metal].name.toUpperCase() : " · LOOSE STONE"}`;
  $("finish").value = state.finish;
  $("finish-value").textContent =
    state.finish < 28 ? "Polished" : state.finish < 70 ? "Satin" : "Brushed";
  $("auto-turn").setAttribute("aria-pressed", String(state.auto));
  viewer.dataset.tool = state.tool;
  viewer.dataset.background = state.background;
  $("exit-loupe").hidden = state.tool !== "loupe";
  $("mode-label").textContent = state.box
    ? "INSIDE THE COLLECTION"
    : state.tool === "loupe"
      ? "THROUGH THE LOUPE"
      : "AT THE BENCH";
  boxExit.hidden = !state.box;
  $("loupe-controls").hidden = state.tool !== "loupe";
  $("tray-tip").hidden = state.tool === "loupe";
  const hint = {
    explore:
      "Drag to look around · scroll / pinch to zoom · double-click to focus",
    turn: "Drag jewelry to turn it · drag the room to look around",
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
  app?.hover(null);
  $("object-hint").hidden = true;
  state.tool = value;
  state.box = null;
  state.auto = false;
  choose("tool", value);
  app?.setAutoTurn(false);
  app?.setTool(value);
  updateLabels();
  announce(
    `${value === "explore" ? "Explore" : value === "turn" ? "Turn" : "Loupe"} selected. ${value === "loupe" ? "Drag to turn the jewelry inside the eyepiece. Escape returns to the bench." : ""}`,
  );
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
    announce(
      (state.source === "penlight" ? "Focused light" : "Broad light") +
        " selected.",
    );
  });
for (const button of document.querySelectorAll("[data-background]"))
  button.addEventListener("click", () => {
    state.background = button.dataset.background;
    choose("background", state.background);
    app?.setBackground(state.background);
    updateLabels();
  });
$("toggle-caustics").addEventListener("click", () => {
  state.caustics = !state.caustics;
  $("toggle-caustics").setAttribute("aria-pressed", String(state.caustics));
  $("toggle-caustics").classList.toggle("selected", state.caustics);
  app?.setCaustics(state.caustics);
  announce(`Refracted light on the bench ${state.caustics ? "on" : "off"}.`);
});
for (const button of document.querySelectorAll("[data-tool]"))
  button.addEventListener("click", () => setTool(button.dataset.tool));
$("finish").addEventListener("input", (event) => {
  state.finish = Number(event.target.value);
  app?.setFinish(state.finish);
  updateLabels();
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
  setTool("explore");
  app?.reset();
  state.loupeX = 0.5;
  state.loupeY = state.setting === "ring" ? 0.35 : 0.49;
  updateLabels();
  announce("View reset.");
});
$("auto-turn").addEventListener("click", () => {
  const next = !state.auto;
  if (next && (state.tool !== "turn" || state.box)) setTool("turn");
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
let grab = null,
  pressed = null,
  travel = 0;
function hoverAt(event) {
  if (!app || dragging) return;
  const p = point(event);
  const action = app.pick(p.x, p.y);
  app.hover(action);
  host.style.cursor = action
    ? ["jewelry", "light"].includes(action.kind)
      ? "grab"
      : "pointer"
    : "grab";
  $("object-hint").textContent = action?.label || "";
  $("object-hint").hidden = !action;
  return action;
}
host.addEventListener("pointerdown", (event) => {
  if (!app || app.transitioning || event.button !== 0) return;
  if (pointers.size) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pinchDistance = distance();
    pressed = null;
    host.setPointerCapture(event.pointerId);
    return;
  }
  const p = point(event),
    action = app.pick(p.x, p.y);

  pressed = action;
  grab =
    action?.kind === "jewelry" && state.tool !== "explore"
      ? "jewelry"
      : "camera";
  travel = 0;
  dragging = true;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  pinchDistance = distance();
  state.auto = false;
  app.setAutoTurn(false);
  updateLabels();
  host.setPointerCapture(event.pointerId);
  host.focus({ preventScroll: true });
  host.style.cursor = "grabbing";
});
host.addEventListener("pointermove", (event) => {
  if (!app) return;
  if (!dragging) {
    hoverAt(event);
    return;
  }
  if (!pointers.has(event.pointerId)) return;
  const next = { x: event.clientX, y: event.clientY };
  const previous = pointers.get(event.pointerId);
  const dx = next.x - previous.x,
    dy = next.y - previous.y;
  travel += Math.hypot(dx, dy);
  pointers.set(event.pointerId, next);
  if (pointers.size === 2) {
    const d = distance();
    if (pinchDistance && d > 0) {
      if (state.tool === "loupe")
        changeMagnification((d - pinchDistance) * 0.015);
      else {
        const pair = [...pointers.values()],
          rect = host.getBoundingClientRect();
        app.zoom(
          pinchDistance / d,
          ((pair[0].x + pair[1].x) / 2 - rect.left) / rect.width,
          ((pair[0].y + pair[1].y) / 2 - rect.top) / rect.height,
        );
      }
    }
    pinchDistance = d;
  } else if (grab === "jewelry") app.rotate(dx * 0.008, dy * 0.008);
  else if (grab === "camera") app.orbit(dx * 0.004, dy * 0.004);
});
function release(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.delete(event.pointerId);
  if (pointers.size) {
    pinchDistance = 0;
    return;
  }
  const activate = event.type === "pointerup" && travel < 9 && pressed;
  dragging = false;
  grab = null;
  pressed = null;
  pinchDistance = 0;
  if (activate?.kind === "gem")
    document.querySelector(`[data-gem="${activate.value}"]`).click();
  if (activate?.kind === "metal") {
    if (state.setting === "loose")
      document.querySelector('[data-setting="ring"]').click();
    document.querySelector(`[data-metal="${activate.value}"]`).click();
    if (activate.finish !== undefined) {
      state.finish = activate.finish;
      app.setFinish(state.finish);
      updateLabels();
      announce(
        `${METALS[state.metal].name}, ${state.finish < 28 ? "polished" : state.finish < 70 ? "satin" : "brushed"} selected.`,
      );
    }
  }
  if (activate?.kind === "box") openBox(activate.value);
  if (activate?.kind === "loupe") setTool("loupe");
  hoverAt(event);
}
host.addEventListener("pointerup", release);
host.addEventListener("pointercancel", release);
host.addEventListener("lostpointercapture", release);
host.addEventListener("pointerleave", () => {
  if (!dragging) {
    app?.hover(null);
    $("object-hint").hidden = true;
  }
});
host.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    if (!app) return;
    if (state.tool === "loupe")
      changeMagnification(event.deltaY < 0 ? 0.2 : -0.2);
    else if (!app.transitioning) {
      const p = point(event);
      app.zoom(
        wheelScale(event.deltaY, event.deltaMode, event.ctrlKey),
        p.x,
        p.y,
      );
    }
  },
  { passive: false },
);
host.addEventListener("dblclick", (event) => {
  if (!app || app.transitioning || state.tool === "loupe") return;
  const p = point(event);
  app.focus(p.x, p.y);
  announce(
    "View focused. Drag to orbit this point; scroll or pinch to move closer.",
  );
});
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
    if (state.tool === "explore") app.orbit(dx * 0.08, dy * 0.08);
    else app.rotate(dx * 0.12, dy * 0.12);
  }
  if (["+", "=", "-", "_"].includes(event.key)) {
    event.preventDefault();
    const more = event.key === "+" || event.key === "=";
    if (state.tool === "loupe") changeMagnification(more ? 1 : -1);
    else app.zoom(more ? 0.9 : 1.1);
  }
  if (event.key.toLowerCase() === "f" && state.tool !== "loupe") {
    event.preventDefault();
    app.focus(0.5, 0.5);
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
  const tool = { 1: "explore", 2: "turn", 3: "loupe" }[event.key];
  if (tool) {
    setTool(tool);
    host.focus({ preventScroll: true });
  }
  if (event.key === "Escape") {
    if (!$("cabinet").hidden) setDrawer(false);
    else if (state.box) boxExit.click();
    else if (state.tool !== "explore") setTool("explore");
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
let ambience = null;
$("toggle-sound").addEventListener("click", async () => {
  if (!ambience) ambience = (await import("./ambience.js")).createAmbience();
  const on = ambience.toggle();
  $("toggle-sound").textContent = on ? "Sound on" : "Sound off";
  $("toggle-sound").setAttribute("aria-pressed", String(on));
});
function prefersStatic() {
  const params = new URLSearchParams(location.search);
  if (params.has("interactive")) return false;
  if (params.has("static")) return true;
  const gl2 = (() => {
    try {
      return !!document.createElement("canvas").getContext("webgl2");
    } catch {
      return false;
    }
  })();
  const phone =
    matchMedia("(pointer: coarse)").matches &&
    Math.min(screen.width, screen.height) < 820;
  return !gl2 || phone;
}
function showStatic() {
  document.body.classList.add("static-mode");
  $("loading").classList.add("static");
  $("static-note").hidden = false;
  $("open-interactive").addEventListener("click", () => {
    const u = new URL(location.href);
    u.searchParams.set("interactive", "");
    location.href = u.href;
  });
}
host.addEventListener("loadprogress", (e) => {
  const { loaded, total } = e.detail;
  if (total > 0)
    $("loading-progress").textContent = `${Math.round((100 * loaded) / total)}%`;
});
async function boot() {
  if (prefersStatic()) {
    showStatic();
    return;
  }
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
    if (state.box) app.focusBox(state.box);
    if (notes.open) app.pause(true);
    updateLabels();
    const loading = $("loading");
    loading.classList.add("fading");
    setTimeout(() => (loading.hidden = true), 950);
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
$("exit-loupe").addEventListener("click", () => setTool("explore"));
notes.addEventListener("close", () => {
  app?.pause(false);
  $("open-notes").focus();
});

updateLabels();
boot();
