import * as THREE from "../vendor/three.module.js";

// A deliberately narrow OBJ reader for the two bundled project-generated meshes.
// Preserve shared indices for smooth cabochons; split vertices for faceted cuts.
export function readGemOBJ(text, smooth = false) {
  const vertices = [],
    indices = [];
  for (const line of text.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (fields[0] === "v") {
      const p = fields.slice(1, 4).map(Number);
      if (p.length !== 3 || !p.every(Number.isFinite))
        throw new Error("Invalid bundled mesh position");
      vertices.push(...p);
    } else if (fields[0] === "f") {
      const face = fields.slice(1).map((v) => Number(v.split("/")[0]) - 1);
      if (
        face.length !== 3 ||
        !face.every(
          (v) => Number.isInteger(v) && v >= 0 && v < vertices.length / 3,
        )
      )
        throw new Error(
          "Bundled gem must contain valid positive-index triangles",
        );
      indices.push(...face);
    }
  }
  if (!vertices.length || !indices.length)
    throw new Error("Empty gemstone mesh");
  let geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  if (!smooth) geometry = geometry.toNonIndexed();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

// Float32 positions/uint32 indices from the selected packed mesh (original/LOD).
export function readSettingBinary(buffer) {
  const header = new DataView(buffer);
  if (header.getUint32(0, true) !== 0x31474e52)
    throw new Error("Invalid setting mesh signature");
  const vertices = header.getUint32(4, true),
    indices = header.getUint32(8, true);
  if (buffer.byteLength !== 12 + vertices * 12 + indices * 4)
    throw new Error("Invalid setting mesh length");
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(buffer, 12, vertices * 3), 3),
  );
  geometry.setIndex(
    new THREE.BufferAttribute(
      new Uint32Array(buffer, 12 + vertices * 12, indices),
      1,
    ),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

export function brilliantGeometry() {
  const vertices = [],
    faces = [],
    n = 16;
  const rings = [
    [0.015, 0],
    [0.59, 0.25],
    [1, 0.63],
    [1, 0.68],
    [0.55, 1.04],
  ];
  for (let r = 0; r < rings.length; r++) {
    const [radius, y] = rings[r];
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n + (r === 1 ? Math.PI / n : 0);
      vertices.push(radius * Math.cos(angle), y, radius * Math.sin(angle));
    }
  }
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i,
        b = r * n + ((i + 1) % n),
        c = (r + 1) * n + i,
        d = (r + 1) * n + ((i + 1) % n);
      faces.push(a, c, b, b, c, d);
    }
  }
  vertices.push(0, 0, 0, 0, 1.04, 0);
  const bottom = vertices.length / 3 - 2,
    top = bottom + 1;
  for (let i = 0; i < n; i++)
    faces.push(bottom, i, (i + 1) % n, top, 4 * n + ((i + 1) % n), 4 * n + i);
  let g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  g.setIndex(faces);
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

export function normalizeGem(geometry, width) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  if (!(span > 0)) throw new Error("Degenerate gem bounds");
  geometry.translate(
    -(box.max.x + box.min.x) / 2,
    -box.min.y,
    -(box.max.z + box.min.z) / 2,
  );
  geometry.scale(width / span, width / span, width / span);
  geometry.computeBoundingBox();
  return geometry;
}

// The imported shank needs cylindrical UVs for the brushed-metal tangent frame.
// Missing UVs make anisotropic materials invalid even when positions look fine.
export function solitaireGeometry(text, deform) {
  const geometry =
    typeof text === "string" ? readGemOBJ(text, true) : text.clone();
  if (deform) {
    deform(geometry);
    geometry.computeVertexNormals();
  }
  const p = geometry.attributes.position,
    n = geometry.attributes.normal,
    index = geometry.index.array;
  const positions = [],
    normals = [],
    uvs = [],
    triangles = [],
    unique = new Map();
  for (let i = 0; i < index.length; i += 3) {
    const face = [];
    for (let j = 0; j < 3; j++) {
      const k = index[i + j],
        x = p.getX(k),
        y = p.getY(k),
        z = p.getZ(k);
      face.push([Math.atan2(y, x) / (2 * Math.PI) + 0.5, z * 0.6 + 0.5]);
    }
    // Unwrap each triangle while retaining the shared smooth normals. A
    // wrap-crossing triangle must not interpolate through the whole brush map.
    for (const axis of [0, 1])
      if (
        Math.max(...face.map((v) => v[axis])) -
          Math.min(...face.map((v) => v[axis])) >
        0.5
      )
        for (const uv of face) if (uv[axis] < 0.5) uv[axis] += 1;
    for (let j = 0; j < 3; j++) {
      const k = index[i + j],
        uv = face[j],
        key = k + (uv[0] >= 1 ? p.count : 0);
      let next = unique.get(key);
      if (next === undefined) {
        next = positions.length / 3;
        unique.set(key, next);
        positions.push(p.getX(k), p.getY(k), p.getZ(k));
        normals.push(n.getX(k), n.getY(k), n.getZ(k));
        uvs.push(...uv);
      }
      triangles.push(next);
    }
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  result.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  result.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  result.setIndex(triangles);
  result.computeBoundingBox();
  geometry.dispose();
  return result;
}

export function lightPosition(angleDegrees, heightDegrees, radius = 5) {
  const a = THREE.MathUtils.degToRad(angleDegrees),
    h = THREE.MathUtils.degToRad(heightDegrees);
  return new THREE.Vector3(
    radius * Math.sin(a) * Math.cos(h),
    0.4 + radius * Math.sin(h),
    radius * Math.cos(a) * Math.cos(h),
  );
}

export function inspectionFieldOfView(zoom) {
  if (!Number.isFinite(zoom) || zoom <= 0)
    throw new Error("Invalid inspection magnification");
  return THREE.MathUtils.radToDeg(
    2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(55 / 2)) / zoom),
  );
}

// Rotate the specimen alone: neither camera nor workshop belongs to this group.
export function turnSpecimen(quaternion, yaw, pitch) {
  if (![yaw, pitch].every(Number.isFinite))
    throw new Error("Invalid specimen rotation");
  quaternion.premultiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
  );
  quaternion.premultiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch),
  );
  quaternion.normalize();
}
