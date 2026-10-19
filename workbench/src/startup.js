// Only an actual context-creation failure warrants browser graphics advice.
export class WorkbenchStartupError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = "WorkbenchStartupError";
    this.code = code;
  }
}

export const graphicsOptions = Object.freeze({
  antialias: false,
  alpha: false,
  stencil: false,
  preserveDrawingBuffer: true,
  powerPreference: "default",
});

export function createGraphicsContext(canvas) {
  let reason = "The browser did not provide a WebGL 2 context.";
  const creationError = (event) => {
    if (event.statusMessage) reason = event.statusMessage;
  };
  canvas.addEventListener("webglcontextcreationerror", creationError);
  try {
    const context = canvas.getContext("webgl2", graphicsOptions);
    if (!context) throw new Error(reason);
    return context;
  } catch (error) {
    throw new WorkbenchStartupError("graphics-unavailable", error.message, error);
  } finally {
    canvas.removeEventListener("webglcontextcreationerror", creationError);
  }
}

export function startupFailure(error) {
  const code = error?.code || "startup-failed";
  const messages = {
    "graphics-unavailable": "This browser couldn’t start the interactive graphics. You can still see the railcar and gemstone images in the gallery.",
    "graphics-interrupted": "The browser interrupted the interactive graphics. The scene images are still available; you can also try opening 3D again.",
    "shader-failed": "The interactive materials couldn’t run on this browser. The scene images are still available in the gallery.",
  };
  return {
    code,
    message: messages[code] || "The interactive view couldn’t finish loading. You can still see the scene images in the gallery, or try again.",
    graphicsHelp: code === "graphics-unavailable",
    detail: `${code}: ${error?.message || String(error)}`.slice(0, 2000),
  };
}
