/**
 * Web NFC (PWA) via the experimental NDEFReader API — Chrome on Android over
 * HTTPS only. Reads the first text record, which holds the opaque card_token.
 * TS has no Web NFC lib types, so the API is accessed defensively.
 */
import type { NfcCapability } from "./nfc";

interface NdefRecordLike {
  recordType: string;
  encoding?: string;
  data?: BufferSource;
}
interface NdefMessageLike {
  records: NdefRecordLike[];
}
interface NdefReaderLike {
  scan: (opts?: { signal?: AbortSignal }) => Promise<void>;
  onreading: ((event: { message: NdefMessageLike }) => void) | null;
  onreadingerror: (() => void) | null;
}

function getReaderCtor(): (new () => NdefReaderLike) | null {
  const ctor = (globalThis as { NDEFReader?: new () => NdefReaderLike }).NDEFReader;
  return ctor ?? null;
}

let controller: AbortController | null = null;

export async function getNfcCapability(): Promise<NfcCapability> {
  if (!getReaderCtor()) {
    return { supported: false, reason: "Web NFC needs Chrome on Android over HTTPS." };
  }
  return { supported: true };
}

export async function readCardToken(): Promise<string | null> {
  const Ctor = getReaderCtor();
  if (!Ctor) return null;

  controller = new AbortController();
  const reader = new Ctor();

  return new Promise<string | null>((resolve) => {
    reader.onreading = (event) => {
      const record = event.message.records.find((r) => r.recordType === "text") ?? event.message.records[0];
      if (!record?.data) return resolve(null);
      try {
        const text = new TextDecoder(record.encoding || "utf-8").decode(record.data);
        resolve(text.trim() || null);
      } catch {
        resolve(null);
      } finally {
        controller?.abort();
      }
    };
    reader.onreadingerror = () => resolve(null);
    reader.scan({ signal: controller!.signal }).catch(() => resolve(null));
  });
}

export async function cancelNfc(): Promise<void> {
  controller?.abort();
  controller = null;
}
