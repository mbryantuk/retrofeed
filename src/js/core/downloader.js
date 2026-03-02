import { getSetting } from './db.js';

/**
 * Download logic for Retrofeed
 */

async function getProxyBase() {
    const custom = await getSetting('proxy_url');
    if (custom && custom.trim()) {
        const url = custom.trim();
        return url.endsWith('/') ? url : (url + '/');
    }
    // Smart default for production domain
    if (window.location.hostname === 'retro.mbryantuk.uk') {
        return 'https://proxy.mbryantuk.uk/';
    }
    return `https://${window.location.hostname}:8080/`;
}

export async function downloadEpisodeBlob(url, onProgress) {
    const localProxyBase = await getProxyBase();
    const proxies = [
        '', // Direct
        localProxyBase,
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?'
    ];

    let lastError = null;

    for (const proxy of proxies) {
        try {
            const proxyUrl = proxy ? (proxy + encodeURIComponent(url)) : url;
            console.log(`📡 Attempting download via "${proxy || 'Direct'}": ${proxyUrl}`);
            
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            // Real progress tracking using ReadableStream
            const contentLength = response.headers.get('content-length');
            const total = parseInt(contentLength, 10);
            
            if (!total || isNaN(total) || !response.body) {
                console.warn('⚠️ No content-length header or body stream found. Progress bar will be indeterminate.');
                const blob = await response.blob();
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

            const blob = new Blob(chunks);
            console.log(`✅ Download successful via "${proxy || 'Direct'}"`);
            return blob;
        } catch (error) {
            console.warn(`⚠️ Download failed with proxy "${proxy}":`, error);
            lastError = error;
        }
    }

    throw lastError || new Error('All download attempts failed');
}
