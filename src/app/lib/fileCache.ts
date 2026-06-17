const DB_NAME = 'KUEnvipaperCache';
const STORE_NAME = 'files';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (e) => {
        console.error('IndexedDB open error:', e);
        resolve(null);
      };
    } catch (e) {
      console.error('IndexedDB not supported or error:', e);
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Fetches a file from a URL and caches it in IndexedDB.
 * Subsequent requests for the same URL will load from IndexedDB.
 */
export async function getCachedFileBlob(url: string): Promise<Blob> {
  if (!url) throw new Error('URL is required');

  const db = await getDB();
  if (!db) {
    // Fallback if IndexedDB is not available
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.blob();
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(url);

      request.onsuccess = async () => {
        if (request.result) {
          resolve(request.result);
        } else {
          // Cache miss: fetch and save
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const blob = await res.blob();

            // Store in db in a new transaction
            const writeTx = db.transaction(STORE_NAME, 'readwrite');
            const writeStore = writeTx.objectStore(STORE_NAME);
            writeStore.put(blob, url);

            // Wait for transaction to complete, but we can resolve the blob immediately
            resolve(blob);
          } catch (fetchErr) {
            reject(fetchErr);
          }
        }
      };

      request.onerror = async (e) => {
        console.warn('Cache read error, falling back to fetch:', e);
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          resolve(await res.blob());
        } catch (fetchErr) {
          reject(fetchErr);
        }
      };
    } catch (err) {
      console.warn('Transaction error, falling back to fetch:', err);
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.blob();
        })
        .then(resolve)
        .catch(reject);
    }
  });
}

const blobUrlMap = new Map<string, string>();

/**
 * Resolves a URL to a local object URL from cache.
 * If the URL is cached, returns the object URL representing the cached Blob.
 * If not cached, fetches the file, caches it, and returns the object URL.
 */
export async function getCachedFileUrl(url: string): Promise<string> {
  if (!url) return '';
  
  // If we already generated a blob URL for this exact URL in this session, reuse it
  if (blobUrlMap.has(url)) {
    return blobUrlMap.get(url)!;
  }

  try {
    const blob = await getCachedFileBlob(url);
    const blobUrl = URL.createObjectURL(blob);
    blobUrlMap.set(url, blobUrl);
    return blobUrl;
  } catch (err) {
    console.error('Failed to get cached file URL, returning original:', err);
    return url;
  }
}
