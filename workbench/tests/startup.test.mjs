import test from "node:test";
import assert from "node:assert/strict";
import { createGraphicsContext, startupFailure, WorkbenchStartupError } from "../src/startup.js";

test("a rejected context preserves Chrome's reason and cleans up its listener", () => {
  const listeners = new Map();
  const canvas = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    getContext(type) {
      assert.equal(type, "webgl2");
      listeners.get("webglcontextcreationerror")({ statusMessage: "Graphics disabled by browser policy" });
      return null;
    },
  };
  assert.throws(() => createGraphicsContext(canvas), (error) => {
    const failure = startupFailure(error);
    assert.equal(failure.code, "graphics-unavailable");
    assert.equal(failure.graphicsHelp, true);
    assert.match(failure.detail, /disabled by browser policy/);
    return true;
  });
  assert.equal(listeners.size, 0);
});

test("successful graphics creation reuses one context with the existing quality options", () => {
  let requests = 0;
  const context = {};
  const canvas = {
    addEventListener() {}, removeEventListener() {},
    getContext(type, options) {
      requests++;
      assert.equal(type, "webgl2");
      assert.equal(options.antialias, false); // offscreen geometry targets own MSAA
      assert.equal(options.preserveDrawingBuffer, true);
      return context;
    },
  };
  assert.equal(createGraphicsContext(canvas), context);
  assert.equal(requests, 1);
});

test("download, shader and interrupted-context failures never recommend enabling graphics", () => {
  for (const error of [
    new TypeError("Failed to fetch"),
    new Error("Asset part: 404"),
    new WorkbenchStartupError("shader-failed", "GPU material compilation failed"),
    new WorkbenchStartupError("graphics-interrupted", "Graphics context interrupted"),
  ]) {
    const failure = startupFailure(error);
    assert.equal(failure.graphicsHelp, false);
    assert.notEqual(failure.code, "graphics-unavailable");
    assert.match(failure.message, /images/);
  }
});
