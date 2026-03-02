import { sanitizeFilename, generateFormattedFilename } from './utils.js';

/**
 * Web File System Access API logic for Retrofeed
 */

/**
 * Requests the user to select a directory (the USB drive) and returns its handle.
 * Creates the top-level /Podcasts folder if it doesn't exist.
 */
export async function getDriveHandle() {
    try {
        // Show directory picker
        const dirHandle = await window.showDirectoryPicker({ 
            mode: 'readwrite',
            id: 'retrofeed_usb' // Remembering the ID helps the browser suggest the same folder next time
        });

        // Ensure the /Podcasts folder exists inside the selected drive
        const podcastsDirHandle = await dirHandle.getDirectoryHandle('Podcasts', { create: true });

        return {
            rootHandle: dirHandle,
            podcastsHandle: podcastsDirHandle,
            name: dirHandle.name
        };
    } catch (error) {
        console.error('Failed to get directory handle:', error);
        throw error;
    }
}

/**
 * Verifies if we have permission to access the handle.
 * If permission is 'prompt', it will trigger a browser prompt.
 * 
 * @param {FileSystemHandle} handle 
 * @param {boolean} withPrompt - If true, triggers prompt if needed
 * @returns {Promise<boolean>}
 */
export async function verifyPermission(handle, withPrompt = true) {
    const opts = { mode: 'readwrite' };
    
    // Check if permission was already granted
    if ((await handle.queryPermission(opts)) === 'granted') {
        return true;
    }
    
    // If not, request permission (this triggers prompt)
    if (withPrompt) {
        if ((await handle.requestPermission(opts)) === 'granted') {
            return true;
        }
    }
    
    return false;
}

/**
 * Syncs an array of episode objects to the provided directory handle.
 * 
 * @param {FileSystemDirectoryHandle} podcastsDirHandle 
 * @param {Array} episodes - Array of episode objects from IndexedDB
 * @param {Array} subscriptions - Array of all subscription objects for fallback title lookup
 * @param {Function} onProgress - Callback for updating UI progress
 * @param {AbortSignal} abortSignal - Optional signal to abort the sync
 * @param {Function} onSuccess - Optional callback when an episode is successfully written
 * @param {string} template - Optional template for filename generation
 */
export async function syncEpisodesToDrive(podcastsDirHandle, episodes, subscriptions, onProgress, abortSignal, onSuccess, template) {
    console.group('🚀 STARTING SYNC TO DEVICE');
    console.log(`Total episodes to sync: ${episodes.length}`);
    
    // Create a robust lookup map (ensuring keys are numbers if possible)
    const subMap = new Map();
    subscriptions.forEach(s => {
        if (s.id) subMap.set(Number(s.id), s.title);
    });

    let count = 0;
    let successCount = 0;
    let failCount = 0;

    for (const ep of episodes) {
        if (abortSignal && abortSignal.aborted) {
            console.warn("🛑 Sync aborted by user signal.");
            console.groupEnd();
            throw new Error("SYNC_ABORTED");
        }

        count++;
        
        // Priority: subMap lookup -> ep.showTitle -> fallback
        let showTitle = null;
        if (ep.subId) {
            showTitle = subMap.get(Number(ep.subId));
        }
        if (!showTitle) showTitle = ep.showTitle;
        if (!showTitle) showTitle = 'Unknown Show';

        // Use the template to re-generate the filename if available, ensuring user overrides apply
        const filename = template ? 
            (generateFormattedFilename(template, { 
                pubDate: ep.pubDate, 
                showTitle: showTitle, 
                epTitle: ep.title 
            }) + '.mp3') : ep.filename;

        if (onProgress) onProgress(count, episodes.length, filename, showTitle);

        try {
            console.group(`📦 Syncing Episode ${count}/${episodes.length}: ${filename}`);

            const safeShowName = sanitizeFilename(showTitle, true);
            console.log(`📁 Target directory: /Podcasts/${safeShowName}/`);
            
            const showDirHandle = await podcastsDirHandle.getDirectoryHandle(safeShowName, { create: true });
            console.log('✅ Show directory handle acquired.');

            // Create or get the file handle
            const fileHandle = await showDirHandle.getFileHandle(filename, { create: true });
            console.log(`✅ File handle acquired: ${filename}`);

            // Write the blob
            console.log(`💾 Writing blob (${(ep.blob.size / 1024 / 1024).toFixed(2)} MB)...`);
            const writable = await fileHandle.createWritable();
            await writable.write(ep.blob);

            // Crucial: Wait for the close to finish completely
            await writable.close();
            console.log('✅ File closed and flushed to disk.');

            // Small artificial delay to allow FS to settle
            await new Promise(r => setTimeout(r, 50));

            console.log(`✨ Successfully synced ${filename}`);
            if (onSuccess) await onSuccess(ep);
            
            successCount++;
            console.groupEnd();
        } catch (err) {
            failCount++;
            if (err.name === 'AbortError' || err.message === 'SYNC_ABORTED') {
                console.groupEnd();
                throw err;
            }
            console.error(`❌ FAILED to sync ${filename}:`, err);
            console.groupEnd();
        }
    }
    
    console.log(`🏁 SYNC COMPLETE. Success: ${successCount}, Failed: ${failCount}`);
    console.groupEnd();
}

/**
 * Scans the Podcasts directory and generates M3U playlist files.
 * Generates one global 'all_podcasts.m3u' and one per-show playlist.
 * 
 * @param {FileSystemDirectoryHandle} podcastsDirHandle 
 * @param {Array} allEpisodes - Full list of episodes from DB for metadata lookup
 */
export async function generateDevicePlaylist(podcastsDirHandle, allEpisodes) {
    console.group('🎵 GENERATING DEVICE PLAYLISTS');
    
    const globalEntries = [];
    const showEntries = new Map(); // showName -> [entries]

    try {
        // 1. Scan the device for all files
        for await (const [showName, showHandle] of podcastsDirHandle.entries()) {
            if (showHandle.kind === 'directory') {
                const entries = [];
                for await (const [fileName, fileHandle] of showHandle.entries()) {
                    if (fileHandle.kind === 'file' && fileName.toLowerCase().endsWith('.mp3')) {
                        // Find metadata in DB to get the real release date
                        const meta = allEpisodes.find(e => e.filename === fileName);
                        const date = meta ? new Date(meta.pubDate || 0) : new Date(0);
                        
                        const entry = {
                            fileName,
                            showName,
                            date,
                            path: `${showName}/${fileName}`
                        };
                        
                        entries.push(entry);
                        globalEntries.push(entry);
                    }
                }
                if (entries.length > 0) {
                    showEntries.set(showName, entries);
                }
            }
        }

        // 2. Generate per-show playlists (Oldest -> Newest)
        for (const [showName, entries] of showEntries.entries()) {
            entries.sort((a, b) => a.date - b.date);
            const content = ['#EXTM3U', ...entries.map(e => e.fileName)].join('\n');
            
            const showDirHandle = await podcastsDirHandle.getDirectoryHandle(showName);
            const fileHandle = await showDirHandle.getFileHandle(`${showName}.m3u`, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            console.log(`✅ Generated playlist for ${showName} (${entries.length} tracks)`);
        }

        // 3. Generate global playlist (Newest First)
        if (globalEntries.length > 0) {
            globalEntries.sort((a, b) => b.date - a.date);
            const content = ['#EXTM3U', ...globalEntries.map(e => e.path)].join('\n');
            
            const fileHandle = await podcastsDirHandle.getFileHandle('all_podcasts.m3u', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            console.log(`✅ Generated global playlist: all_podcasts.m3u (${globalEntries.length} tracks)`);
        }

    } catch (err) {
        console.error('❌ Failed to generate playlists:', err);
    }
    
    console.groupEnd();
}

/**
 * Recursively deletes all files and folders inside a directory handle.
 * @param {FileSystemDirectoryHandle} dirHandle 
 */
export async function clearDirectory(dirHandle) {
    for await (const [name, handle] of dirHandle.entries()) {
        await dirHandle.removeEntry(name, { recursive: true });
    }
}

/**
 * Saves a JSON configuration to the root of the selected device.
 * 
 * @param {FileSystemDirectoryHandle} rootHandle 
 * @param {Object} config - The subscription list/config object
 */
export async function saveConfigToDevice(rootHandle, config) {
    try {
        const fileHandle = await rootHandle.getFileHandle('.retrofeed_config.json', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(config, null, 2));
        await writable.close();
        console.log('✅ Config saved to device.');
    } catch (err) {
        console.error('❌ Failed to save config to device:', err);
    }
}

/**
 * Loads the JSON configuration from the root of the selected device.
 * 
 * @param {FileSystemDirectoryHandle} rootHandle 
 * @returns {Promise<Object|null>}
 */
export async function loadConfigFromDevice(rootHandle) {
    try {
        const fileHandle = await rootHandle.getFileHandle('.retrofeed_config.json');
        const file = await fileHandle.getFile();
        const content = await file.text();
        return JSON.parse(content);
    } catch (err) {
        console.warn('⚠️ No config found on device.');
        return null;
    }
}

/**
 * Lists all file names in a directory handle.
 * @param {FileSystemDirectoryHandle} dirHandle 
 * @returns {Promise<Set<string>>}
 */
export async function getDirectoryFiles(dirHandle) {
    const files = new Set();
    try {
        for await (const [name, handle] of dirHandle.entries()) {
            if (handle.kind === 'file') {
                files.add(name);
            }
        }
    } catch (err) {
        console.error('Error reading directory entries:', err);
    }
    return files;
}
