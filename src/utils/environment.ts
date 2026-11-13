export function isNodeEnvironment(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof process.versions === "object" &&
    typeof process.versions.node === "string"
  );
}

export function isBlobLike(input: unknown): input is Blob {
  try {
    // Native brand checks accept other realms, but reject forged toStringTags/prototypes.
    return typeof blobSize?.call(input) === "number";
  } catch {
    return false;
  }
}

export function isFileLike(input: unknown): input is File {
  try {
    return typeof fileName?.call(input) === "string";
  } catch {
    return false;
  }
}

const blobSize =
  typeof Blob === "undefined"
    ? undefined
    : Object.getOwnPropertyDescriptor(Blob.prototype, "size")?.get;
const fileName =
  typeof File === "undefined"
    ? undefined
    : Object.getOwnPropertyDescriptor(File.prototype, "name")?.get;
