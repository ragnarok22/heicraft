export async function open(): Promise<never> {
  throw new Error("node:fs/promises is not available in browser builds.");
}
