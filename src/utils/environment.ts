export function isNodeEnvironment(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof process.versions === "object" &&
    typeof process.versions.node === "string"
  );
}

export function isBlobLike(input: unknown): input is Blob {
  return typeof Blob !== "undefined" && input instanceof Blob;
}

export function isFileLike(input: unknown): input is File {
  return typeof File !== "undefined" && input instanceof File;
}
