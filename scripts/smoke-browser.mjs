import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const projectRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const directory = await mkdtemp(join(tmpdir(), "heicraft-browser-"));

try {
  await writeFile(
    join(directory, "index.js"),
    'import { convertHeic } from "heicraft"; window.__heicraftConvertHeic = convertHeic;\n',
  );

  await writeFile(
    join(directory, "index.html"),
    '<script type="module" src="/index.js"></script>\n',
  );
  await mkdir(join(directory, "node_modules"));
  await symlink(projectRoot, join(directory, "node_modules", "heicraft"), "dir");

  const outputDirectory = join(directory, "dist");
  await build({
    root: directory,
    configFile: false,
    logLevel: "silent",
    build: {
      emptyOutDir: true,
      outDir: outputDirectory,
      rollupOptions: {
        input: join(directory, "index.html"),
      },
    },
  });

  const scripts = await collectJavaScriptFiles(outputDirectory);
  if (scripts.length === 0) {
    throw new Error("Browser smoke test could not find bundled JavaScript.");
  }

  const forbidden = ["sharp/lib", "@img/sharp", "browser-external:node:fs/promises"];
  for (const script of scripts) {
    const contents = await readFile(script, "utf8");
    const match = forbidden.find((text) => contents.includes(text));
    if (match) {
      throw new Error(`Browser bundle ${script} includes ${match}.`);
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

async function collectJavaScriptFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJavaScriptFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(path);
    }
  }

  return files;
}
