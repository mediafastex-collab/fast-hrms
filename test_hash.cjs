const crypto = require('crypto');
function hex(bytes) { return [...bytes].map(b => b.toString(16).padStart(2, "0")).join(""); }
function fromHex(value) { return new Uint8Array(value.match(/.{1,2}/g).map(byte => parseInt(byte, 16))); }
async function verifyPassword(password, stored) {
  const [method, iterationsText, saltHex, hashHex] = stored.split("$");
  const salt = fromHex(saltHex);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: Number(iterationsText) }, key, 256);
  console.log(hex(new Uint8Array(bits)) === hashHex);
}
verifyPassword("password123", "pbkdf2$100000$e671a3fb60e5c2a32c22683bb1af01b8$52dd14f62656ea29d726811b998970b8e263f7e6f5b53e0aac0834b2be5b382b");
