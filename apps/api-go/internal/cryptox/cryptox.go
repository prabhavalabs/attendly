// Package cryptox reproduces the Worker's auth/crypto byte-for-byte so existing
// password hashes, refresh-token hashes, JWTs and AES-GCM blobs keep working
// after the cutover.
//
//   - password hash: pbkdf2$100000$<saltB64Std>$<hashB64Std>  (PBKDF2-SHA256)
//   - JWT:           HS256, claims {sub,email,name,iat,exp}, base64url
//   - refresh hash:  SHA-256 hex of the raw token
//   - AES-GCM:       key = SHA-256(secret), base64Std(iv(12) || ciphertext|tag)
package cryptox

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

const (
	pbkdf2Iterations = 100_000
	saltBytes        = 16
	hashBytes        = 32
	isoLayout        = "2006-01-02T15:04:05.000Z07:00" // matches JS Date.toISOString()
)

// HashPassword returns a hash in the Worker's format.
func HashPassword(password string) (string, error) {
	salt := make([]byte, saltBytes)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	dk, err := pbkdf2.Key(sha256.New, password, salt, pbkdf2Iterations, hashBytes)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("pbkdf2$%d$%s$%s", pbkdf2Iterations,
		base64.StdEncoding.EncodeToString(salt),
		base64.StdEncoding.EncodeToString(dk)), nil
}

// VerifyPassword checks a password against a stored hash, in constant time.
func VerifyPassword(password, stored string) bool {
	parts := strings.Split(stored, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2" {
		return false
	}
	iter, err := strconv.Atoi(parts[1])
	if err != nil || iter < 1 {
		return false
	}
	salt, err := base64.StdEncoding.DecodeString(parts[2])
	if err != nil {
		return false
	}
	expected, err := base64.StdEncoding.DecodeString(parts[3])
	if err != nil {
		return false
	}
	actual, err := pbkdf2.Key(sha256.New, password, salt, iter, len(expected))
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

// Claims is the access-token payload (field order matches the Worker).
type Claims struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Iat   int64  `json:"iat"`
	Exp   int64  `json:"exp"`
}

type jwtHeader struct {
	Alg string `json:"alg"`
	Typ string `json:"typ"`
}

// SignJWT produces an HS256 token byte-compatible with the Worker.
func SignJWT(c Claims, secret string) (string, error) {
	h, err := json.Marshal(jwtHeader{Alg: "HS256", Typ: "JWT"})
	if err != nil {
		return "", err
	}
	b, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	signing := b64url(h) + "." + b64url(b)
	return signing + "." + b64url(hmacSHA256([]byte(signing), secret)), nil
}

// VerifyJWT validates signature + expiry and returns the claims.
func VerifyJWT(token, secret string) (*Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errors.New("malformed token")
	}
	expected := hmacSHA256([]byte(parts[0]+"."+parts[1]), secret)
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || !hmac.Equal(expected, sig) {
		return nil, errors.New("invalid signature")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}
	var c Claims
	if err := json.Unmarshal(raw, &c); err != nil {
		return nil, err
	}
	if c.Exp <= 0 || c.Exp*1000 <= time.Now().UnixMilli() {
		return nil, errors.New("expired")
	}
	return &c, nil
}

// SHA256Hex matches the Worker's refresh-token hashing.
func SHA256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

// RandomToken returns base64url of n random bytes (no padding).
func RandomToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func aesKey(secret string) []byte {
	sum := sha256.Sum256([]byte(secret))
	return sum[:]
}

// AESEncrypt returns base64Std(iv(12) || ciphertext|tag).
func AESEncrypt(plaintext, secret string) (string, error) {
	block, err := aes.NewCipher(aesKey(secret))
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	iv := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(iv); err != nil {
		return "", err
	}
	ct := gcm.Seal(nil, iv, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(append(iv, ct...)), nil
}

// AESDecrypt reverses AESEncrypt; ok=false on any failure.
func AESDecrypt(payload, secret string) (string, bool) {
	raw, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return "", false
	}
	block, err := aes.NewCipher(aesKey(secret))
	if err != nil {
		return "", false
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil || len(raw) < gcm.NonceSize() {
		return "", false
	}
	iv, ct := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	pt, err := gcm.Open(nil, iv, ct, nil)
	if err != nil {
		return "", false
	}
	return string(pt), true
}

const idAlphabet = "useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict_-"

// NewID returns prefix + "_" + 21 url-safe chars (nanoid-shaped).
func NewID(prefix string) string {
	b := make([]byte, 21)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = idAlphabet[int(b[i])%len(idAlphabet)]
	}
	return prefix + "_" + string(b)
}

// NowISO is ISO-8601 UTC with millisecond precision (storage convention).
func NowISO() string {
	return time.Now().UTC().Format(isoLayout)
}

// ISOIn returns the time `seconds` from now, ISO-8601 UTC.
func ISOIn(seconds int) string {
	return time.Now().UTC().Add(time.Duration(seconds) * time.Second).Format(isoLayout)
}

func hmacSHA256(data []byte, secret string) []byte {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write(data)
	return m.Sum(nil)
}

func b64url(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }
