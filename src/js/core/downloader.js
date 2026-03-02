import { getSetting } from './db.js';

/**
 * Download logic for Retrofeed
 * High-reliability implementation with retries, timeouts, and proxy fallback.
 */

const DOWNLOAD_TIMEOUT_MS = 60000; // 60 seconds for the whole file
const FETCH_TIMEOUT_MS = 15000;    // 15 seconds just to get headers
const MAX_RETRIES_PER_PROXY = 2;

async function getProxyBase() {
    const custom = await getSetting('proxy_url');
    if (custom && custom.trim()) {
        const url = custom.trim();
        return url.endsWith('/') ? url : (url + '/');
    }
    if (window.location.hostname === 'retro.mbryantuk.uk') {
        return 'https://proxy.mbryantuk.uk/';
    }
    return `https://${window.location.hostname}:8080/`;
}

/**
 * Helper for exponential backoff
 */
const sleep = (ms) => new Promise(resolve => setTimeout(ms, resolve));

export async function downloadEpisodeBlob(url, onProgress) {
    const localProxyBase = await getProxyBase();
    
    // Ordered list of strategies
    const strategies = [
        { name: 'Local Proxy', base: localProxyBase },
        { name: 'CORSProxy.io', base: 'https://corsproxy.io/?' },
        { name: 'AllOrigins', base: 'https://api.allorigins.win/raw?url=' },
        { name: 'Direct', base: '' }
    ];

    let lastError = null;

    for (const strategy of strategies) {
        for (let attempt = 0; attempt <= MAX_RETRIES_PER_PROXY; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

            try {
                const finalUrl = strategy.base ? (strategy.base + encodeURIComponent(url)) : url;
                console.log(`📡 [${strategy.name}] Attempt ${attempt + 1}/${MAX_RETRIES_PER_PROXY + 1}: ${finalUrl}`);
                
                const response = await fetch(finalUrl, { 
                    signal: controller.signal,
                    headers: { 'Accept': 'audio/mpeg, audio/*, */*' }
                });
                
                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} ${response.statusText}`);
                }

                // If we got here, we have a successful connection. 
                // Now handle the stream with a larger overall timeout.
                const contentTimeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

                const contentLength = response.headers.get('content-length');
                const total = parseInt(contentLength, 10);
                
                if (!total || isNaN(total) || !response.body) {
                    console.warn(`⚠️ [${strategy.name}] No content-length. Indeterminate download...`);
                    const blob = await response.blob();
                    clearTimeout(contentTimeoutId);
                    if (onProgress) onProgress(100);
                    return blob;
                }

                const reader = response.body.getReader();
                let loaded = 0;
                const chunks = [];

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                    loaded += value.length;
                    
                    if (onProgress) {
                        const percent = Math.round((loaded / total) * 100);
                        onProgress(percent);
                    }
                }

                clearTimeout(contentTimeoutId);
                const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'audio/mpeg' });
                
                if (blob.size < 1000) {
                    throw new Error('Downloaded file too small (likely a proxy error page)');
                }

                console.log(`✅ [${strategy.name}] Download successful! (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
                return blob;

            } catch (error) {
                clearTimeout(timeoutId);
                console.warn(`⚠️ [${strategy.name}] Attempt ${attempt + 1} failed:`, error.name === 'AbortError' ? 'Timeout' : error.message);
                lastError = error;
                
                // If it's a 404 or something clearly permanent, don't bother retrying this proxy
                if (error.message.includes('404')) break;

                // Wait before retry
                if (attempt < MAX_RETRIES_PER_PROXY) {
                    await sleep(1000 * (attempt + 1));
                }
            }
        }
    }

    throw new Error(`All download strategies failed. Last error: ${lastError?.message}`);
}
