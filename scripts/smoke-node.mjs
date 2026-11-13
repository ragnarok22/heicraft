import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import * as heicraft from "heicraft";
import { detectHeic, isHeic } from "heicraft/detect";

for (const name of [
  "convertHeic",
  "isHeic",
  "detectHeic",
  "getHeicInfo",
  "HeicraftError",
  "InvalidInputError",
  "ResourceLimitError",
  "UnsupportedFormatError",
  "ConversionError",
  "AbortError",
]) {
  assert.ok(name in heicraft, `Missing package export ${name}.`);
}
const fixture = new URL("../tests/fixtures/pattern.heic", import.meta.url);
const input = await readFile(fixture);
assert.equal(await isHeic(input), true);
assert.equal((await detectHeic(input)).codec, "hevc");
assert.deepEqual(await detectHeic(input), await heicraft.detectHeic(input));
assert.equal(await isHeic(fileURLToPath(fixture)), true);
assert.equal((await heicraft.getHeicInfo(input)).width, 32);

for (const [format, source] of [
  ["jpeg", fileURLToPath(fixture)],
  ["png", new Blob([input])],
  ["webp", input],
]) {
  const result = await heicraft.convertHeic(source, { format });
  assert.ok(result.data instanceof Uint8Array);
  const image = sharp(result.data);
  assert.equal((await image.metadata()).format, format);
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 32);
  assert.equal(info.height, 32);
  const offset = (8 * 32 + 8) * 4;
  for (const [channel, expected] of [220, 180, 100, 255].entries()) {
    assert.ok(Math.abs(data[offset + channel] - expected) <= 12);
  }
  console.log(`Native ${format} conversion passed (${process.platform}, ${process.version}).`);
}
assert.ok(input.byteLength > 0, "A caller-owned Buffer must not be detached.");
