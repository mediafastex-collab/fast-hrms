const crypto = require('crypto');
function hex(bytes) { return [...bytes].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 100000;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${hex(salt)}$${hex(new Uint8Array(bits))}`;
}
hashPassword("password123").then(console.log);
