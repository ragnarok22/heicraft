export async function open(): Promise<never> {
  throw new Error("node:fs/promises is not available in browser builds.");
}
export const constants = { O_RDONLY: 0, O_NONBLOCK: 0 };
