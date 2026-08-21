// Encrypted-at-rest storage for the DeepSeek API key (spec §47).
//
// The key is encrypted with AES-GCM using a device-bound CryptoKey that lives
// in IndexedDB with extractable=false — WebCrypto guarantees the raw key bytes
// can't be exported, so a snapshot of storage isn't enough to recover the API
// key (JS in this origin would still have to run). Falls back to plain
// localStorage if crypto/IndexedDB aren't available (very old browsers).
//
// The API is intentionally sync-with-cache: consumers read a cached value that
// the loader populates on startup; writes are async and update the cache.

const LS_LEGACY = "qf.ai.apiKey"; // legacy plaintext, migrated on load
const LS_CIPHER = "qf.ai.apiKey.enc"; // base64 { iv | ciphertext }
const DB_NAME = "qf-secrets";
const STORE = "keys";
const KEY_ID = "aes-gcm-v1";

let cached: string | null = null;
let ready: Promise<void> | null = null;

async function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function loadKey(db: IDBDatabase): Promise<CryptoKey | null> {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY_ID);
    tx.onsuccess = () => resolve((tx.result as CryptoKey) ?? null);
    tx.onerror = () => resolve(null);
  });
}

async function saveKey(db: IDBDatabase, key: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite").objectStore(STORE).put(key, KEY_ID);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getOrCreateKey(): Promise<CryptoKey | null> {
  const db = await openDb();
  if (!db || !globalThis.crypto?.subtle) return null;
  let key = await loadKey(db);
  if (!key) {
    // extractable=false → the raw AES key never leaves the browser's crypto layer.
    key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    await saveKey(db, key);
  }
  db.close();
  return key;
}

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64decode(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function encrypt(plaintext: string): Promise<string | null> {
  const key = await getOrCreateKey();
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  );
  const packed = new Uint8Array(iv.length + ct.length);
  packed.set(iv, 0);
  packed.set(ct, iv.length);
  return b64encode(packed);
}

async function decrypt(packed: string): Promise<string | null> {
  const key = await getOrCreateKey();
  if (!key) return null;
  try {
    const bytes = b64decode(packed);
    const iv = bytes.slice(0, 12);
    const ct = bytes.slice(12);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

async function init(): Promise<void> {
  try {
    // Migrate any legacy plaintext value on first run of this build.
    const legacy = localStorage.getItem(LS_LEGACY);
    if (legacy) {
      const enc = await encrypt(legacy);
      if (enc) localStorage.setItem(LS_CIPHER, enc);
      localStorage.removeItem(LS_LEGACY);
      cached = legacy;
      return;
    }
    const enc = localStorage.getItem(LS_CIPHER);
    if (enc) cached = await decrypt(enc);
  } catch {
    /* ignore */
  }
}

/** Kick off decryption on app boot; safe to call multiple times. */
export function initSecretStore(): Promise<void> {
  if (!ready) ready = init();
  return ready;
}

export const secretStore = {
  /** Synchronous read — reflects the value loaded/decrypted at startup. */
  getApiKey(): string | null {
    return cached;
  },

  /** Persist a new key (encrypted). Returns after the write completes. */
  async setApiKey(value: string): Promise<void> {
    const v = value.trim();
    cached = v || null;
    try {
      if (!v) {
        localStorage.removeItem(LS_CIPHER);
        return;
      }
      const enc = await encrypt(v);
      if (enc) localStorage.setItem(LS_CIPHER, enc);
      else localStorage.setItem(LS_CIPHER, btoa(unescape(encodeURIComponent(v)))); // fallback
    } catch {
      /* ignore */
    }
  },

  clear(): void {
    cached = null;
    try {
      localStorage.removeItem(LS_CIPHER);
      localStorage.removeItem(LS_LEGACY);
    } catch {
      /* ignore */
    }
  },

  hasApiKey(): boolean {
    return !!cached;
  },
};
