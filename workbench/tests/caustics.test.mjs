import test from "node:test";
import assert from "node:assert/strict";
import { photonSamples } from "../src/caustics.js";

test("projected photon disk integrates to the analytical cone flux without multiplying energy by RGB sample count", () => {
  const count = 8192,
    samples = photonSamples(count);
  const intensity = 100,
    distance = 3.2,
    radius = 1.1;
  const totals = [0, 0, 0];
  for (let i = 0; i < samples.length; i += 3) {
    const r2 = samples[i] * radius * radius;
    const cosine = distance / Math.sqrt(distance * distance + r2);
    totals[samples[i + 2]] +=
      ((intensity * Math.PI * radius * radius) /
        (distance * distance * count)) *
      cosine ** 3;
  }
  // Independent exact solid angle of the disk's subtended cone.
  const expected =
    intensity * 2 * Math.PI * (1 - distance / Math.hypot(distance, radius));
  for (const total of totals) assert.ok(Math.abs(total / expected - 1) < 1e-6);
  assert.equal(totals[0], totals[1]);
  assert.equal(totals[1], totals[2]);
});

test("RGB photon paths share incident samples, cover the disk and remain deterministic between frames", () => {
  const count = 4096,
    samples = photonSamples(count);
  assert.deepEqual(samples, photonSamples(count));
  const bins = new Uint32Array(64);
  for (let i = 0; i < count; i++) {
    const at = i * 9;
    for (let c = 0; c < 3; c++) {
      assert.equal(samples[at + c * 3], samples[at]);
      assert.equal(samples[at + c * 3 + 1], samples[at + 1]);
      assert.equal(samples[at + c * 3 + 2], c);
    }
    const u = samples[at],
      v = samples[at + 1];
    assert.ok(u > 0 && u < 1 && v >= 0 && v < 1);
    bins[Math.floor(u * 8) * 8 + Math.floor(v * 8)]++;
  }
  for (const n of bins) assert.equal(n, count / 64);
});
