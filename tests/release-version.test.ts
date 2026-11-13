import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const { version } = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
const run = promisify(execFile);

it("accepts the exact release tag without shell expansion or stderr", async () => {
  const result = await run(process.execPath, ["scripts/check-release-version.mjs"], {
    env: { ...process.env, GITHUB_REF_NAME: `v${version}` },
  });
  expect(result.stderr).toBe("");
});

it("reports mismatched tags literally instead of evaluating them as shell or JavaScript", async () => {
  const tag = "v$(false)'`bad-tag`";
  await expect(
    run(process.execPath, ["scripts/check-release-version.mjs"], {
      env: { ...process.env, GITHUB_REF_NAME: tag },
    }),
  ).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining(`Tag ${tag} does not match package version ${version}.`),
  });
});
