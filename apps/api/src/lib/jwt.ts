/**
 * Minimal JWT (HS256) using WebCrypto — no external dependency.
 * Access tokens carry sub/email/name + iat/exp (SRS §6.1, §9).
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
}

function toB64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function encodeJson(obj: unknown): string {
  return toB64Url(enc.encode(JSON.stringify(obj)));
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Sign an HS256 JWT. */
export async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const body = encodeJson(payload);
  const data = `${header}.${body}`;
  const key = await importKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return `${data}.${toB64Url(sig)}`;
}

/**
 * Verify an HS256 JWT and check expiry. Returns the payload, or null if the
 * token is malformed, the signature is invalid, or it has expired.
 */
export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];

  const key = await importKey(secret);
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${body}`)),
  );
  if (!timingSafeEqual(expected, fromB64Url(sig))) return null;

  let payload: JwtPayload;
  try {
    payload = JSON.parse(dec.decode(fromB64Url(body))) as JwtPayload;
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) return null;
  return payload;
}
