// Minimal IndexedDB cache helper with TTL support
const DB_NAME = 'gtg-cache-v1';
const STORE_NAME = 'cache';
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // If the store still doesn't exist (rare), reopen with higher version to create it
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const ver = db.version + 1;
        db.close();
        const req2 = indexedDB.open(DB_NAME, ver);
        req2.onupgradeneeded = () => {
          const db2 = req2.result;
          if (!db2.objectStoreNames.contains(STORE_NAME)) db2.createObjectStore(STORE_NAME, { keyPath: 'key' });
        };
        req2.onsuccess = () => resolve(req2.result);
        req2.onerror = () => reject(req2.error);
      } else {
        resolve(db);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = fn(store);
    tx.oncomplete = () => resolve(req.result);
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('IDB error'));
  });
}

export async function setCache(key, value, ttlMs = 24 * 60 * 60 * 1000) {
  try {
    const payload = { key, ts: Date.now(), ttl: ttlMs, value };
    await withStore('readwrite', store => store.put(payload));
    return true;
  } catch (e) {
    console.warn('idbCache.setCache failed', e);
    return false;
  }
}

export async function getCache(key) {
  try {
    const res = await withStore('readonly', store => store.get(key));
    if (!res) return null;
    if (typeof res.ts === 'number' && typeof res.ttl === 'number') {
      if (Date.now() - res.ts > res.ttl) {
        // expired
        try { await delCache(key); } catch (e) {}
        return null;
      }
    }
    return res.value;
  } catch (e) {
    console.warn('idbCache.getCache failed', e);
    return null;
  }
}

export async function delCache(key) {
  try {
    await withStore('readwrite', store => store.delete(key));
    return true;
  } catch (e) {
    console.warn('idbCache.delCache failed', e);
    return false;
  }
}

export async function clearExpired() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return;
        const rec = cur.value;
        if (rec && typeof rec.ts === 'number' && typeof rec.ttl === 'number' && Date.now() - rec.ts > rec.ttl) cur.delete();
        cur.continue();
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('idbCache.clearExpired failed', e);
    return false;
  }
}

export default { setCache, getCache, delCache, clearExpired };
