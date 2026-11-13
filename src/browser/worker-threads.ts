export function Worker(): never {
  throw new Error("node:worker_threads is not available in browser builds.");
}
