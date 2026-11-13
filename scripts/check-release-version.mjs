import { readFile } from "node:fs/promises";

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const tag = process.env.GITHUB_REF_NAME;
if (tag !== `v${version}`) {
  throw new Error(`Tag ${tag ?? "(missing)"} does not match package version ${version}.`);
}
