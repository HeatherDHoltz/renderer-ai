// Both layers use the same camera and unsigned-integer depth textures. An
// additive normalized-depth epsilon grows into a visible world-space gap as
// the eye moves away, allowing buried geometry to bleed through the room.
export const layerDepthGLSL = `
float layerVisibility(float liveDepth, float roomDepth) {
  return step(liveDepth, roomDepth);
}`;

export function layerIsVisible(liveDepth, roomDepth) {
  return liveDepth <= roomDepth;
}
