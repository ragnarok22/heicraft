export async function readFile(): Promise<never> {
  throw new Error("node:fs/promises is not available in browser builds.");
}
