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
});
