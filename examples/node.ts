import { writeFile } from "node:fs/promises";
import { convertHeic } from "heicraft";

const result = await convertHeic("./photo.heic", {
  format: "webp",
  quality: 0.85,
});

if (!(result.data instanceof Uint8Array)) {
  throw new Error("Expected Uint8Array output in Node.js.");
}

await writeFile("./photo.webp", result.data);
