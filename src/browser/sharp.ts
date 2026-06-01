export default function sharpBrowserStub(): never {
  throw new Error("sharp is not available in browser builds.");
}
