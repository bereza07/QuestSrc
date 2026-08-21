// Tiny IndexedDB key/value store used to persist the browser (sql.js) database
// bytes between sessions. Only used in the web fallback — the desktop app
// persists natively via tauri-plugin-sql.

const DB_NAME = "questforge-store";
const STORE = "kv";
const KEY = "database";

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadDbBytes(): Promise<Uint8Array | null> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => {
      const val = req.result;
      resolve(val ? new Uint8Array(val) : null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveDbBytes(bytes: Uint8Array): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    // Store a copy of the buffer so later mutations don't affect it.
    tx.objectStore(STORE).put(bytes.slice(), KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
