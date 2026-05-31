/**
 * NFC card reading — platform-split.
 *   - native (iOS/Android): `nfc.native.ts` via react-native-nfc-manager
 *   - web (PWA):            `nfc.web.ts` via the Web NFC API (NDEFReader)
 *
 * This base module is the unsupported fallback and the type source the rest of
 * the app resolves against. Card tags store the opaque `card_token` (the same
 * value encoded in the printed QR), so a read resolves to a token string.
 */
export interface NfcCapability {
  supported: boolean;
  /** Why NFC is unavailable, when supported is false. */
  reason?: string;
}

export async function getNfcCapability(): Promise<NfcCapability> {
  return { supported: false, reason: "NFC is not available on this platform." };
}

/** Read a single NFC tag and return its card token, or null if none/cancelled. */
export async function readCardToken(): Promise<string | null> {
  return null;
}

/** Abort an in-flight read (best-effort). */
export async function cancelNfc(): Promise<void> {
  /* no-op */
}
