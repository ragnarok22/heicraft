import { encodeOffscreen } from "../encoders/browser.ts";
import { decodeHeic, readHeicMetadata } from "../decoder-core.ts";
import { serializeError, type WorkerRequest, type WorkerResponse } from "./protocol.ts";

export async function executeRequest(request: WorkerRequest): Promise<WorkerResponse> {
  try {
    const result =
      request.operation === "metadata"
        ? await readHeicMetadata(request.bytes, request.maxPixels, request.inspectAlpha)
        : await decodeHeic(request.bytes, request.maxPixels);
    if (request.operation === "convert" && "data" in result) {
      return {
        id: request.id,
        ok: true,
        result: await encodeOffscreen(result, request.format, request.quality),
      };
    }
    return { id: request.id, ok: true, result };
  } catch (error) {
    return { id: request.id, ok: false, error: serializeError(error) };
  }
}

export function responseTransfers(response: WorkerResponse): ArrayBuffer[] {
  return response.ok && "data" in response.result ? [response.result.data.buffer] : [];
}
