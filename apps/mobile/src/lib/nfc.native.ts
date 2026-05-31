/**
 * Native NFC (iOS / Android) via react-native-nfc-manager.
 * Requires a custom dev client / production build — not available in Expo Go.
 * Reads the first NDEF text record, which holds the opaque card_token.
 */
import NfcManager, { NfcTech, Ndef } from "react-native-nfc-manager";
import type { NfcCapability } from "./nfc";

let started = false;
async function ensureStarted(): Promise<boolean> {
  if (started) return true;
  try {
    const supported = await NfcManager.isSupported();
    if (!supported) return false;
    await NfcManager.start();
    started = true;
    return true;
  } catch {
    return false;
  }
}

export async function getNfcCapability(): Promise<NfcCapability> {
  try {
    const supported = await NfcManager.isSupported();
    if (!supported) return { supported: false, reason: "This device has no NFC hardware." };
    await ensureStarted();
    return { supported: true };
  } catch {
    return { supported: false, reason: "NFC could not be initialised." };
  }
}

export async function readCardToken(): Promise<string | null> {
  if (!(await ensureStarted())) return null;
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const tag = await NfcManager.getTag();
    const record = tag?.ndefMessage?.[0];
    if (!record?.payload) return null;
    const token = Ndef.text.decodePayload(Uint8Array.from(record.payload));
    return token?.trim() || null;
  } catch {
    // User cancelled or read failed.
    return null;
  } finally {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch {
      /* ignore */
    }
  }
}

export async function cancelNfc(): Promise<void> {
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch {
    /* ignore */
  }
}
