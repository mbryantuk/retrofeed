/**
 * IndexedDB operations for Retrofeed
 */

const DB_NAME = 'RetrofeedDB';
const DB_VERSION = 3; // Incremented to 3 to ensure 'device' store is created

let dbInstance = null;

export function initDB() {
    return new Promise((resolve, reject) => {
        if (dbInstance) {
            resolve(dbInstance);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Store podcast subscriptions
            if (!db.objectStoreNames.contains('subscriptions')) {
                const subStore = db.createObjectStore('subscriptions', { keyPath: 'id', autoIncrement: true });
                subStore.createIndex('url', 'url', { unique: true });
            }

            // Store downloaded episodes and blobs
            if (!db.objectStoreNames.contains('episodes')) {
                const epStore = db.createObjectStore('episodes', { keyPath: 'id', autoIncrement: true });
                epStore.createIndex('subId', 'subId', { unique: false });
                epStore.createIndex('enclosureUrl', 'enclosureUrl', { unique: true });
            }

            // Store global settings
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }

            // Store for device handles (persisting FileSystemHandle)
            if (!db.objectStoreNames.contains('device')) {
                db.createObjectStore('device', { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            resolve(dbInstance);
        };

        request.onerror = (event) => {
            reject(`IndexedDB error: ${event.target.errorCode}`);
        };
    });
}

export async function addSubscription(sub) {
    const db = await initDB();
    
    // Check if it exists by URL first to avoid uniqueness constraint error
    const existing = await new Promise((resolve) => {
        const tx = db.transaction('subscriptions', 'readonly');
        const store = tx.objectStore('subscriptions');
        const index = store.index('url');
        const request = index.get(sub.url);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });

    return new Promise((resolve, reject) => {
        const tx = db.transaction('subscriptions', 'readwrite');
        const store = tx.objectStore('subscriptions');
        
        // If it exists, make sure we use the same numeric ID to perform an update
        if (existing) {
            sub.id = existing.id;
        }
        
        const request = store.put(sub);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getSubscriptions() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('subscriptions', 'readonly');
        const store = tx.objectStore('subscriptions');
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function removeSubscription(id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('subscriptions', 'readwrite');
        const store = tx.objectStore('subscriptions');
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function removeEpisodesBySubId(subId) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('episodes', 'readwrite');
        const store = tx.objectStore('episodes');
        const index = store.index('subId');
        const request = index.openCursor(IDBKeyRange.only(subId));

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            } else {
                resolve();
            }
        };
        request.onerror = (event) => reject(event.target.error);
    });
}

// For caching blobs
export async function saveEpisodeBlob(episodeData) {
    const db = await initDB();

    // Check if it exists by enclosureUrl first
    const existing = await new Promise((resolve) => {
        const tx = db.transaction('episodes', 'readonly');
        const store = tx.objectStore('episodes');
        const index = store.index('enclosureUrl');
        const request = index.get(episodeData.enclosureUrl);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });

    return new Promise((resolve, reject) => {
        const tx = db.transaction('episodes', 'readwrite');
        const store = tx.objectStore('episodes');
        
        // If it exists, keep the same internal ID to perform an update
        if (existing) {
            episodeData.id = existing.id;
        }
        
        const request = store.put(episodeData); 

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Marks an episode as being on the physical device.
 * Clears the blob to save space but keeps the metadata.
 */
export async function markEpisodeAsOnDevice(enclosureUrl) {
    const db = await initDB();
    
    // 1. Get existing
    const existing = await new Promise((resolve) => {
        const tx = db.transaction('episodes', 'readonly');
        const store = tx.objectStore('episodes');
        const index = store.index('enclosureUrl');
        const request = index.get(enclosureUrl);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });

    if (!existing) return;

    // 2. Update status and remove blob
    return new Promise((resolve, reject) => {
        const tx = db.transaction('episodes', 'readwrite');
        const store = tx.objectStore('episodes');
        
        existing.status = 'on-device';
        existing.blob = null; // Purge from local storage
        
        const request = store.put(existing);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function getEpisodesBySubId(subId) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('episodes', 'readonly');
        const store = tx.objectStore('episodes');
        const index = store.index('subId');
        const request = index.getAll(subId);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getAllEpisodes() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('episodes', 'readonly');
        const store = tx.objectStore('episodes');
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Settings functions
export async function getSetting(key, defaultValue = null) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('settings', 'readonly');
        const store = tx.objectStore('settings');
        const request = store.get(key);

        request.onsuccess = () => {
            resolve(request.result ? request.result.value : defaultValue);
        };
        request.onerror = () => reject(request.error);
    });
}

export async function setSetting(key, value) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('settings', 'readwrite');
        const store = tx.objectStore('settings');
        const request = store.put({ key, value });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function clearEpisodeCache() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('episodes', 'readwrite');
        const store = tx.objectStore('episodes');
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function saveDeviceHandle(handle) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('device', 'readwrite');
        const store = tx.objectStore('device');
        // We only ever store one device handle
        const request = store.put({ id: 'current_usb', handle });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function getSavedDeviceHandle() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('device', 'readonly');
        const store = tx.objectStore('device');
        const request = store.get('current_usb');

        request.onsuccess = () => {
            resolve(request.result ? request.result.handle : null);
        };
        request.onerror = () => reject(request.error);
    });
}

export async function removeDeviceHandle() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('device', 'readwrite');
        const store = tx.objectStore('device');
        const request = store.delete('current_usb');

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
