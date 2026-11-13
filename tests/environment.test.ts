import { expect, it } from "vitest";
import { isBlobLike, isFileLike } from "../src/utils/environment";

it("does not accept forged Blob/File brands or prototypes", () => {
  for (const input of [
    { [Symbol.toStringTag]: "Blob", size: 10, arrayBuffer: async () => new ArrayBuffer(10) },
    { [Symbol.toStringTag]: "File", name: "photo.heic" },
    Object.create(Blob.prototype),
    Object.create(File.prototype),
    null,
  ]) {
    expect(isBlobLike(input)).toBe(false);
    expect(isFileLike(input)).toBe(false);
  }
  expect(isBlobLike(new Blob())).toBe(true);
  expect(isFileLike(new Blob())).toBe(false);
  expect(isFileLike(new File([], "photo.heic"))).toBe(true);
});
