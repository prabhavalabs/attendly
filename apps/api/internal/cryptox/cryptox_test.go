package cryptox

import "testing"

// Hash produced earlier by the Node/Worker crypto for password "perftest1234".
// If Go validates it, the password-hash format is byte-compatible across the
// cutover and existing users can still log in.
const nodeHash = "pbkdf2$100000$EPJRWy6hXKGxqybTIBeJmw==$vyIJdKnkzmNgiB9aNCSfoS2IQRyXbBjVXeyTkKyByXg="

func TestVerifyNodeGeneratedHash(t *testing.T) {
	if !VerifyPassword("perftest1234", nodeHash) {
		t.Fatal("Go failed to verify a Node-generated PBKDF2 hash — formats diverged")
	}
	if VerifyPassword("wrongpassword", nodeHash) {
		t.Fatal("verified an incorrect password")
	}
}

func TestHashRoundTrip(t *testing.T) {
	h, err := HashPassword("hunter2hunter2")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyPassword("hunter2hunter2", h) {
		t.Fatal("round-trip verify failed")
	}
}

func TestJWTRoundTrip(t *testing.T) {
	c := Claims{Sub: "usr_1", Email: "a@b.c", Name: "A", Iat: 1, Exp: 9999999999}
	tok, err := SignJWT(c, "secret")
	if err != nil {
		t.Fatal(err)
	}
	got, err := VerifyJWT(tok, "secret")
	if err != nil {
		t.Fatal(err)
	}
	if got.Sub != "usr_1" || got.Email != "a@b.c" {
		t.Fatalf("claims mismatch: %+v", got)
	}
	if _, err := VerifyJWT(tok, "wrong-secret"); err == nil {
		t.Fatal("verified with wrong secret")
	}
}

func TestSHA256Hex(t *testing.T) {
	// echo -n abc | sha256sum
	if got := SHA256Hex("abc"); got != "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" {
		t.Fatalf("sha256 mismatch: %s", got)
	}
}

func TestAESRoundTrip(t *testing.T) {
	enc, err := AESEncrypt("a-secret-oauth-token", "encryption-key")
	if err != nil {
		t.Fatal(err)
	}
	pt, ok := AESDecrypt(enc, "encryption-key")
	if !ok || pt != "a-secret-oauth-token" {
		t.Fatalf("decrypt failed ok=%v pt=%q", ok, pt)
	}
	if _, ok := AESDecrypt(enc, "wrong-key"); ok {
		t.Fatal("decrypted with wrong key")
	}
}
