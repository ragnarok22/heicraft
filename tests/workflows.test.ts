import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflowPaths = [".github/workflows/ci.yml", ".github/workflows/publish.yml"];

describe("GitHub workflows", () => {
  it.each(workflowPaths)("uses the packageManager pnpm version in %s", async (workflowPath) => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      packageManager?: string;
    };
    const workflow = await readFile(workflowPath, "utf8");
    const setupStepStart = workflow.indexOf("      - name: Setup pnpm");
    const nextStepStart = workflow.indexOf("\n      - ", setupStepStart + 1);
    const setupStep = workflow.slice(
      setupStepStart,
      nextStepStart === -1 ? undefined : nextStepStart,
    );

    expect(packageJson.packageManager).toMatch(/^pnpm@/);
    expect(setupStep).toContain("uses: pnpm/action-setup");
    expect(setupStep).not.toMatch(/^\s+version:/m);
  });

  it("uses CI Node versions compatible with the configured pnpm version", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      packageManager: string;
    };
    const workflow = await readFile(".github/workflows/ci.yml", "utf8");
    const pnpmMajor = Number(/pnpm@(\d+)/.exec(packageJson.packageManager)?.[1]);
    const nodeVersions = getCiNodeVersions(workflow);
    const minimumNodeMajor = pnpmMajor >= 11 ? 22 : 18;

    expect(Math.min(...nodeVersions)).toBeGreaterThanOrEqual(minimumNodeMajor);
  });

  it("advertises the oldest Node major exercised by CI", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      engines: { node: string };
    };
    const workflow = await readFile(".github/workflows/ci.yml", "utf8");
    const engineMinimumMajor = Number(/^>=(\d+)/.exec(packageJson.engines.node)?.[1]);

    expect(engineMinimumMajor).toBe(Math.min(...getCiNodeVersions(workflow)));
  });
});

function getCiNodeVersions(workflow: string): number[] {
  const versionList = /node-version:\s*\[([^\]]+)]/.exec(workflow)?.[1];

  if (!versionList) {
    throw new Error("Unable to find the Node.js CI matrix.");
  }

  return versionList.split(",").map((version) => Number(version.trim()));
}
