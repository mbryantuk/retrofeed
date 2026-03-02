import { 
    initDB, addSubscription, getSubscriptions, removeSubscription, 
    saveEpisodeBlob, getAllEpisodes, getSetting, setSetting, 
    clearEpisodeCache, removeEpisodesBySubId, markEpisodeAsOnDevice,
    saveDeviceHandle, getSavedDeviceHandle, removeDeviceHandle
} from './core/db.js';
import { fetchAndParseFeed, searchPodcasts, getProxyBase } from './core/rss.js';
import { generateFormattedFilename, getPodcastInitial } from './core/utils.js';
import { downloadEpisodeBlob } from './core/downloader.js';
import { transcodeToMP3 } from './core/transcoder.js';
import { openSearchModal } from './ui/searchModal.js';
import { getDriveHandle, syncEpisodesToDrive, generateDevicePlaylist, clearDirectory, verifyPermission, getDirectoryFiles, saveConfigToDevice, loadConfigFromDevice } from './core/fs.js';
import { exportToOPML, importFromOPML } from './core/opml.js';
import { getSession, login, logout, register, upgradeToPremium } from './ui/auth.js';
import { initPlayer } from './ui/player.js';
import { initThemes, applyTheme } from './ui/themes.js';
import { startOnboarding } from './ui/onboarding.js';
import { playClick, playSuccess, playError } from './ui/sounds.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- UI Logger ---
    const logsContainer = document.getElementById('logs-container');

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalGroup = console.group;
    const originalGroupEnd = console.groupEnd;

    function addLogToUI(msg, type = 'log') {
        if (!logsContainer) return;
        const entry = document.createElement('div');
        entry.style.marginBottom = '0.2rem';
        
        if (type === 'warn') entry.style.color = 'var(--color-accent)';
        if (type === 'error') entry.style.color = 'var(--color-error)';
        if (type === 'group') entry.style.fontWeight = '800';

        const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        entry.textContent = `[${timestamp}] ${msg}`;
        logsContainer.appendChild(entry);
        
        if (logsContainer.scrollHeight - logsContainer.scrollTop < logsContainer.clientHeight + 100) {
            logsContainer.scrollTop = logsContainer.scrollHeight;
        }
    }

    const formatArg = (a) => {
        if (a instanceof Error) return `${a.name}: ${a.message}`;
        if (typeof a === 'object') {
            try { return JSON.stringify(a); } catch(e) { return String(a); }
        }
        return String(a);
    };

    console.log = (...args) => {
        originalLog.apply(console, args);
        addLogToUI(args.map(formatArg).join(' '), 'log');
    };
    console.warn = (...args) => {
        originalWarn.apply(console, args);
        addLogToUI(args.map(formatArg).join(' '), 'warn');
    };
    console.error = (...args) => {
        originalError.apply(console, args);
        const msg = args.map(formatArg).join(' ');
        addLogToUI(msg, 'error');
    };

    window.addEventListener('error', (e) => console.error(e.error || e.message));
    window.addEventListener('unhandledrejection', (e) => console.error(e.reason));

    console.group = (...args) => {
        originalGroup.apply(console, args);
        addLogToUI(`▼ ${args.join(' ')}`, 'group');
    };
    console.groupEnd = () => originalGroupEnd.apply(console);

    // Check for Secure Context immediately
    if (!window.isSecureContext) {
        console.error("⚠️ NON-SECURE CONTEXT DETECTED: Web File System Access API (USB Sync) WILL NOT WORK over plain HTTP on remote IPs. Please use HTTPS.");
    }

    const checkFileSystemSupport = () => {
        const warning = document.getElementById('compatibility-warning');
        if (!window.showDirectoryPicker) {
            console.error("❌ window.showDirectoryPicker is not defined. This browser/context does not support the File System Access API.");
            if (warning) warning.classList.remove('hidden');
            return false;
        }
        if (warning) warning.classList.add('hidden');
        return true;
    };

    checkFileSystemSupport();

    document.getElementById('clear-logs-btn').onclick = () => {
        logsContainer.innerHTML = '';
    };

    document.getElementById('test-proxy-btn').onclick = async () => {
        console.group('🔍 PROXY CONNECTIVITY TEST');
        try {
            const proxyBase = await getProxyBase();
            console.log(`📡 Current Proxy Base: ${proxyBase}`);
            
            if (!proxyBase || proxyBase.includes('localhost') || proxyBase.includes('127.0.0.1')) {
                console.warn('⚠️ You are using a local proxy. If you are on a remote IP, this will fail in the browser.');
            }

            // Use a stable, proxy-friendly target instead of Google
            const target = 'https://api.allorigins.win/get?url=https://google.com';
            const testUrl = `${proxyBase}${encodeURIComponent(target)}`;
            console.log(`🌐 Fetching test URL: ${testUrl}`);
            
            const start = Date.now();
            const res = await fetch(testUrl, { method: 'GET', redirect: 'follow' });
            const duration = Date.now() - start;

            console.log(`✅ Status: ${res.status} ${res.statusText}`);
            
            if (res.redirected) {
                console.error(`⛔ REDIRECT DETECTED: You were redirected to: ${res.url}`);
                if (res.url.includes('cloudflareaccess.com')) {
                    console.error('❌ CLOUDFLARE ACCESS IS STILL BLOCKING THIS REQUEST. Please ensure your "Bypass" policy is at the TOP of the list in Cloudflare Dashboard.');
                }
            }

            console.log(`📄 Content-Type: ${res.headers.get('content-type')}`);
            console.log(`📜 CORP Header: ${res.headers.get('cross-origin-resource-policy') || 'MISSING'}`);
            
            if (res.ok) {
                console.log('✨ PROXY TEST SUCCESSFUL!');
            } else {
                console.error('❌ PROXY RETURNED ERROR STATUS');
            }
        } catch (e) {
            console.error('❌ PROXY TEST FAILED:', e);
            console.log('💡 TIP: If you see TypeError: Failed to fetch, it often means the proxy domain is unreachable or Cloudflare Access is blocking it.');
            
            const proxyBase = await getProxyBase();
            const manualUrl = `${proxyBase}https://google.com`;
            console.log(`🔗 MANUALLY VERIFY HERE: ${manualUrl}`);
            
            if (confirm('Proxy fetch failed. Would you like to open the proxy test URL in a new tab to check for a login wall?')) {
                window.open(manualUrl, '_blank');
            }
        }
        console.groupEnd();
    };

    document.getElementById('download-logs-btn').onclick = () => {
        const blob = new Blob([logsContainer.innerText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `retrofeed_logs_${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    initPlayer();
    initThemes();

    // --- Version Check & Update Enforcement ---
    let currentAppVersion = null;

    async function checkForUpdates() {
        try {
            const response = await fetch('/api/version');
            if (response.ok) {
                const data = await response.json();
                
                const versionDisplay = document.getElementById('log-version-display');
                if (versionDisplay) versionDisplay.textContent = `v${data.version}`;

                if (currentAppVersion && currentAppVersion !== data.version) {
                    console.log(`🚀 New version detected: ${data.version}. Updating...`);
                    // We can show a prompt or just force reload
                    if (confirm(`A new version of Retrofeed (${data.version}) is available. Update now?`)) {
                        window.location.reload(true); // Force reload ignoring cache
                    }
                }
                currentAppVersion = data.version;
            }
        } catch (e) {
            console.warn('Could not check for updates:', e);
        }
    }

    // Check version every 5 minutes
    setInterval(checkForUpdates, 300000);
    // And also check once on startup
    setTimeout(checkForUpdates, 1000);

    // UI Elements
    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('app-container');
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    const authModeText = document.getElementById('auth-mode-text');
    const logoutBtn = document.getElementById('logout-btn');
    const logoutBtnSettings = document.getElementById('logout-btn-settings');
    const usernameInput = document.getElementById('username-input');
    const passwordInput = document.getElementById('password-input');
    const authError = document.getElementById('auth-error');
    const userGreeting = document.getElementById('user-greeting');

    const homeView = document.getElementById('home-view');
    const settingsView = document.getElementById('settings-view');
    const podcastView = document.getElementById('podcast-view');
    const logsView = document.getElementById('logs-view');
    const navHome = document.getElementById('nav-home');
    const navSettings = document.getElementById('nav-settings');
    const navLogs = document.getElementById('nav-logs');
    const sidebarSubsList = document.getElementById('sidebar-subs-list');
    
    const addBtn = document.getElementById('add-btn');
    const rssInput = document.getElementById('rss-input');
    const syncBtn = document.getElementById('sync-btn');
    const syncOverlay = document.getElementById('sync-status-indicator');
    const syncOverlayTitle = document.getElementById('sync-overlay-title');
    const syncBar = document.getElementById('sync-overlay-bar');
    const syncSubtitle = document.getElementById('sync-overlay-subtitle');
    const syncShowName = document.getElementById('sync-show-name');
    const syncMeta = document.getElementById('sync-overlay-meta');
    const syncAbortBtn = document.getElementById('sync-overlay-abort');

    // Toggle dropdown on click
    syncOverlay.onclick = (e) => {
        if (e.target.closest('.sync-abort-btn')) return; // Don't toggle when clicking abort
        syncOverlay.classList.toggle('active');
    };

    const connectDeviceBtn = document.getElementById('connect-device-btn');
    const deviceConnCTA = document.getElementById('device-connection-cta');
    const syncActiveArea = document.getElementById('sync-active-area');
    const syncProgress = document.getElementById('sync-progress');
    const statusText = document.getElementById('sync-status-text');
    const abortSyncBtn = document.getElementById('abort-sync-btn');
    const clearDeviceBtn = document.getElementById('clear-device-btn');
    const clearCacheBtn = document.getElementById('clear-cache-btn');
    const rebuildPlaylistsBtn = document.getElementById('rebuild-playlists-btn');
    
    const templateInput = document.getElementById('global-filename-template');
    const proxyUrlInput = document.getElementById('setting-proxy-url');
    const themeSelect = document.getElementById('theme-select');
    const bitrateSelect = document.getElementById('transcode-bitrate');
    const globalRuleSelect = document.getElementById('setting-global-rule');
    const upgradeBtn = document.getElementById('upgrade-premium-btn');
    const premiumStatusText = document.getElementById('premium-status-text');
    
    const deviceStatusDot = document.querySelector('.status-dot');

    let isDeviceConnected = false;
    let currentDirHandle = null;
    let isAppInitialized = false;
    let syncAbortController = null;
    let activePodcast = null;

    // --- Navigation ---

    function switchView(viewId) {
        [homeView, settingsView, podcastView, logsView].forEach(v => v.classList.add('hidden'));
        document.getElementById(viewId).classList.remove('hidden');
        
        [navHome, navSettings, navLogs].forEach(n => n.classList.remove('active'));
        if (viewId === 'home-view') navHome.classList.add('active');
        if (viewId === 'settings-view') navSettings.classList.add('active');
        if (viewId === 'logs-view') navLogs.classList.add('active');
        
        if (viewId !== 'podcast-view') {
            document.querySelectorAll('.sub-nav-item').forEach(i => i.classList.remove('active'));
        }
    }

    navHome.addEventListener('click', () => {
        playClick();
        switchView('home-view');
    });

    navSettings.addEventListener('click', () => {
        playClick();
        switchView('settings-view');
        updatePremiumUI();
    });

    navLogs.addEventListener('click', () => {
        playClick();
        switchView('logs-view');
    });

    // --- Auth Logic ---

    const session = getSession();
    if (session) showMainApp(session.username);
    else showLoginScreen();

    function showMainApp(username) {
        authContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        userGreeting.textContent = username.toUpperCase();
        initializeApp();
    }

    function showLoginScreen() {
        appContainer.classList.add('hidden');
        authContainer.classList.remove('hidden');
    }
loginBtn.addEventListener('click', async () => {
    console.log("Attempting login...");
    playClick();
    try {
        const newSession = await login(usernameInput.value, passwordInput.value);
        console.log("Login success!");
        playSuccess();
        showMainApp(newSession.username);
    } catch (e) {
        console.error("Login Error:", e);
        authError.textContent = e.message;
    }
});

    registerBtn.addEventListener('click', async () => {
        console.log("Attempting registration...");
        playClick();
        try {
            const msg = await register(usernameInput.value, passwordInput.value);
            console.log("Registration success!");
            playSuccess();
            authError.textContent = msg;
            authError.style.color = 'var(--color-success)';
            setTimeout(() => {
                authModeText.click();
                authError.textContent = '';
                authError.style.color = 'var(--color-error)';
            }, 2000);
        } catch (e) {
            playError();
            authError.textContent = e.message;
        }
    });

    authModeText.addEventListener('click', () => {
        const isReg = registerBtn.classList.toggle('hidden');
        loginBtn.classList.toggle('hidden', !isReg);
        authModeText.textContent = isReg ? 'Need an account? Register here.' : 'Already have an account? Login here.';
    });

    logoutBtn.addEventListener('click', () => {
        logout();
        window.location.reload();
    });

    if (logoutBtnSettings) {
        logoutBtnSettings.addEventListener('click', () => {
            logout();
            window.location.reload();
        });
    }

    async function syncFullConfigToDevice() {
        if (!isDeviceConnected || !currentDirHandle) return;
        
        console.log("💾 Syncing full config to device...");
        const subs = await getSubscriptions();
        const settings = {
            filename_template: await getSetting('filename_template', "{YYYY}{MM}{DD} - {TITLE}"),
            proxy_url: await getSetting('proxy_url', ''),
            transcode_bitrate: await getSetting('transcode_bitrate', 'none'),
            global_sync_rule: await getSetting('global_sync_rule', 'auto_1'),
            auto_refresh_on_load: await getSetting('auto_refresh_on_load', 'false'),
            auto_sync_to_device: await getSetting('auto_sync_to_device', 'false'),
            generate_m3u: await getSetting('generate_m3u', 'false'),
            theme: localStorage.getItem('retrofeed_theme') || 'modern-dark'
        };

        await saveConfigToDevice(currentDirHandle, { 
            subscriptions: subs,
            settings: settings,
            last_synced: new Date().toISOString(),
            app_version: currentAppVersion
        });
    }

    // --- App Init ---

    async function initializeApp() {
        if (isAppInitialized) return;
        isAppInitialized = true;
        
        // Debugging
        window.APP_VERSION = '1.3.7';
        window.processFeedAdd = processFeedAdd;
        
        startOnboarding();
        await initDB();
        await checkPersistentDevice();
        
        const savedTemplate = await getSetting('filename_template', "{YYYY}{MM}{DD} - {TITLE}");
        templateInput.value = savedTemplate;
        templateInput.addEventListener('change', async () => {
            await setSetting('filename_template', templateInput.value);
            await syncFullConfigToDevice();
        });

        const savedProxy = await getSetting('proxy_url', '');
        proxyUrlInput.value = savedProxy;
        proxyUrlInput.addEventListener('change', async () => {
            await setSetting('proxy_url', proxyUrlInput.value);
            await syncFullConfigToDevice();
        });

        const savedBitrate = await getSetting('transcode_bitrate', 'none');
        bitrateSelect.value = savedBitrate;
        bitrateSelect.addEventListener('change', async () => {
            await setSetting('transcode_bitrate', bitrateSelect.value);
            await syncFullConfigToDevice();
        });

        const savedGlobalRule = await getSetting('global_sync_rule', 'auto_1');
        if (globalRuleSelect) {
            globalRuleSelect.value = savedGlobalRule;
            globalRuleSelect.addEventListener('change', async () => {
                await setSetting('global_sync_rule', globalRuleSelect.value);
                await syncFullConfigToDevice();
            });
        }

        const autoRefreshCheck = document.getElementById('setting-auto-refresh');
        const autoSyncCheck = document.getElementById('setting-auto-sync');

        const savedAutoRefresh = await getSetting('auto_refresh_on_load', 'false') === 'true';
        if (autoRefreshCheck) {
            autoRefreshCheck.checked = savedAutoRefresh;
            autoRefreshCheck.onchange = async () => {
                await setSetting('auto_refresh_on_load', autoRefreshCheck.checked.toString());
                await syncFullConfigToDevice();
            };
        }

        const savedAutoSync = await getSetting('auto_sync_to_device', 'false') === 'true';
        if (autoSyncCheck) {
            autoSyncCheck.checked = savedAutoSync;
            autoSyncCheck.onchange = async () => {
                await setSetting('auto_sync_to_device', autoSyncCheck.checked.toString());
                await syncFullConfigToDevice();
            };
        }

        const m3uCheck = document.getElementById('setting-generate-m3u');
        const savedM3U = await getSetting('generate_m3u', 'false') === 'true';
        if (m3uCheck) {
            m3uCheck.checked = savedM3U;
            m3uCheck.onchange = async () => {
                await setSetting('generate_m3u', m3uCheck.checked.toString());
                await syncFullConfigToDevice();
            };
        }

        const savedTheme = localStorage.getItem('retrofeed_theme') || 'modern-dark';
        themeSelect.value = savedTheme;
        applyTheme(savedTheme);

        themeSelect.addEventListener('change', async () => {
            applyTheme(themeSelect.value);
            await syncFullConfigToDevice();
        });

        // OPML Wiring
        document.getElementById('export-opml-btn').onclick = async () => exportToOPML(await getSubscriptions());
        const opmlInput = document.getElementById('opml-file-input');
        document.getElementById('import-opml-btn').onclick = () => opmlInput.click();
        opmlInput.onchange = async (e) => {
            const imports = await importFromOPML(e.target.files[0]);
            for (const item of imports) await processFeedAdd(item.url, '', false);
            await renderSubscriptions();
        };

        // Drag and Drop for Sidebar
        import('https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/modular/sortable.complete.esm.js').then(module => {
            const Sortable = module.default;
            new Sortable(sidebarSubsList, {
                animation: 150,
                ghostClass: 'skeleton',
                onEnd: () => playClick()
            });
        });

        updatePremiumUI();
        await renderSubscriptions();

        // Auto-refresh feeds on startup if enabled
        if (savedAutoRefresh) {
            console.log("🚀 Auto-refreshing all feeds on load...");
            refreshAllFeeds(true); // silent mode
        } else {
            console.log("⏭️ Auto-refresh on load disabled.");
        }

        // Set up hourly refresh
        setInterval(() => {
            console.log("⏰ Hourly background refresh triggered...");
            refreshAllFeeds(true);
        }, 3600000);

        // PWA Service Worker Registration
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then(reg => console.log('🚀 Service Worker registered:', reg.scope))
                    .catch(err => console.warn('❌ Service Worker failed:', err));
            });
        }
    }

    let isRefreshing = false;

    async function refreshAllFeeds(silent = false) {
        if (isRefreshing) {
            console.log("⏳ Refresh already in progress, skipping...");
            return;
        }
        isRefreshing = true;
        if (!silent) console.group('🔄 REFRESHING ALL FEEDS');
        const btn = document.getElementById('refresh-all-btn');
        const originalText = btn?.textContent;
        
        if (btn && !silent) {
            btn.disabled = true;
            btn.textContent = '...';
        }
        
        try {
            const subs = await getSubscriptions();
            let count = 0;
            for (const sub of subs) {
                count++;
                if (btn && !silent) btn.textContent = `${count}/${subs.length}`;
                try {
                    await processFeedAdd(sub.url, sub.artwork, false);
                } catch (err) {
                    console.error(`❌ Failed to refresh ${sub.title}:`, err);
                }
            }
            
            if (!silent) playSuccess();
            await renderSubscriptions();
            await updateCacheCounter();

            // Auto-Sync after refresh if enabled
            const autoSync = await getSetting('auto_sync_to_device', 'false') === 'true';
            if (autoSync && isDeviceConnected) {
                console.log("🚀 Auto-sync triggered after full refresh...");
                syncBtn.click();
            }
        } catch (e) {
            console.error('❌ Bulk refresh failed:', e);
            if (!silent) playError();
        } finally {
            if (btn && !silent) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
            if (!silent) console.groupEnd();
            isRefreshing = false;
        }
    }

    document.getElementById('refresh-all-btn').onclick = () => refreshAllFeeds(false);

    // --- Podcast View Logic ---

    async function showPodcast(sub) {
        activePodcast = sub;
        switchView('podcast-view');
        
        const artwork = document.getElementById('view-podcast-artwork');
        const title = document.getElementById('view-podcast-title');
        const folderOverride = document.getElementById('view-show-title-override');
        const ruleSelect = document.getElementById('view-download-rule');
        const epList = document.getElementById('view-episode-list');
        const heroBackdrop = document.getElementById('hero-backdrop');

        artwork.src = sub.artwork || '';
        artwork.onerror = () => {
            artwork.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23374151'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='40' fill='white'%3E${getPodcastInitial(sub.title)}%3C/text%3E%3C/svg%3E`;
        };
        
        if (heroBackdrop) {
            if (sub.artwork) {
                heroBackdrop.style.backgroundImage = `url(${sub.artwork})`;
            } else {
                heroBackdrop.style.backgroundImage = 'none';
            }
        }

        title.textContent = sub.title;
        folderOverride.value = sub.title;
        ruleSelect.value = sub.downloadRule || 'auto_1';

        folderOverride.onchange = async () => {
            sub.title = folderOverride.value;
            await addSubscription(sub);
            await renderSubscriptions();
            await syncFullConfigToDevice();
        };

        ruleSelect.onchange = async () => {
            sub.downloadRule = ruleSelect.value;
            await addSubscription(sub);
            await renderSubscriptions();
            await syncFullConfigToDevice();
        };

        epList.innerHTML = '<li class="skeleton" style="height:60px"></li><li class="skeleton" style="height:60px"></li>';
        
        try {
            const feed = await fetchAndParseFeed(sub.url);
            
            let deviceFiles = new Set();
            if (isDeviceConnected && currentDirHandle) {
                try {
                    const podcastsDir = await currentDirHandle.getDirectoryHandle('Podcasts', { create: true });
                    const showDir = await podcastsDir.getDirectoryHandle(sub.title, { create: true });
                    deviceFiles = await getDirectoryFiles(showDir);
                } catch (err) {
                    console.warn('Could not read show directory on device:', err);
                }
            }
            
            renderEpisodes(sub, feed.items, deviceFiles);
        } catch (e) {
            epList.innerHTML = '<li style="padding:2rem; text-align:center; color:var(--color-error)">Failed to load feed content.</li>';
        }
    }

    async function renderEpisodes(sub, items, deviceFiles = new Set()) {
        const epList = document.getElementById('view-episode-list');
        epList.innerHTML = '';
        
        const cached = await getAllEpisodes();
        const cachedMap = new Map(cached.filter(e => e.subId === sub.id).map(e => [e.enclosureUrl, e]));
        const template = templateInput.value || "{YYYY}{MM}{DD} - {TITLE}";

        items.forEach(item => {
            const li = document.createElement('li');
            li.className = 'episode-item';
            
            const cacheInfo = cachedMap.get(item.enclosureUrl);
            const isCached = cacheInfo && cacheInfo.status === 'downloaded';
            const wasSynced = cacheInfo && cacheInfo.status === 'on-device';
            
            // Check if it's on the device by checking for the formatted filename
            const expectedFilename = generateFormattedFilename(template, { 
                pubDate: item.pubDate, 
                showTitle: sub.title, 
                epTitle: item.title 
            }) + '.mp3';
            
            const isOnDevice = deviceFiles.has(expectedFilename) || wasSynced;
            
            let actionBtnHTML = '';
            
            // Logic for Action Buttons
            if (isCached) {
                actionBtnHTML = `<button class="action-btn btn-small danger-text del-ep-btn">DELETE</button>`;
            } else if (isOnDevice) {
                actionBtnHTML = `<button class="action-btn btn-small dl-ep-btn">RE-DOWNLOAD</button>
                                <button class="action-btn btn-small danger-text unlink-ep-btn" style="margin-left:4px" title="Mark as not on device">UNLINK</button>`;
            } else {
                actionBtnHTML = `<button class="action-btn btn-small dl-ep-btn">DOWNLOAD</button>`;
            }

            // Dual Chip HTML
            const serverChip = isCached 
                ? '<span class="status-badge status-cached">SERVER</span>' 
                : '<span class="status-badge" style="opacity:0.2; background:rgba(255,255,255,0.05);">SERVER</span>';
            
            const deviceChip = isOnDevice 
                ? '<span class="status-badge status-device">DEVICE</span>' 
                : '<span class="status-badge" style="opacity:0.2; background:rgba(255,255,255,0.05);">DEVICE</span>';
            
            li.innerHTML = `
                <div class="ep-title">${item.title}</div>
                <div class="ep-meta">
                    <span>${new Date(item.pubDate).toLocaleDateString()}</span>
                    <div style="display:inline-flex; gap:4px; margin-left:8px;">
                        ${serverChip}
                        ${deviceChip}
                    </div>
                </div>
                <div class="ep-actions">
                    <button class="action-btn btn-small play-ep-btn">PLAY</button>
                    ${actionBtnHTML}
                </div>
            `;

            // ... (keep listeners but add unlink)
            const unlinkBtn = li.querySelector('.unlink-ep-btn');
            if (unlinkBtn) {
                unlinkBtn.onclick = async () => {
                    await removeEpisodesBySubId(sub.id); // This is overkill, let's fix it
                    // Better: just delete this specific one
                    const db = await initDB();
                    const tx = db.transaction('episodes', 'readwrite');
                    const store = tx.objectStore('episodes');
                    const index = store.index('enclosureUrl');
                    const request = index.get(item.enclosureUrl);
                    request.onsuccess = () => {
                        if (request.result) store.delete(request.result.id);
                    };
                    tx.oncomplete = () => renderEpisodes(sub, items, deviceFiles);
                };
            }

            li.querySelector('.play-ep-btn').onclick = () => window.playEpisode(item.enclosureUrl, item.title, sub.title, sub.artwork);
            
            const dlBtn = li.querySelector('.dl-ep-btn');
            if (dlBtn) {
                dlBtn.onclick = async () => {
                    dlBtn.disabled = true;
                    dlBtn.textContent = '...';
                    await cacheEpisode(sub.id, sub.title, item);
                    renderEpisodes(sub, items, deviceFiles);
                };
            }

            const delBtn = li.querySelector('.del-ep-btn');
            if (delBtn) {
                delBtn.onclick = async () => {
                    await saveEpisodeBlob({ subId: sub.id, showTitle: sub.title, enclosureUrl: item.enclosureUrl, status: 'available', blob: null });
                    renderEpisodes(sub, items, deviceFiles);
                };
            }

            epList.appendChild(li);
        });
    }

    // --- Subscriptions & Sync ---

    async function renderSubscriptions() {
        const subs = await getSubscriptions();

        // Sync config to device if connected
        if (isDeviceConnected && currentDirHandle) {
            await syncFullConfigToDevice();
        }

        sidebarSubsList.innerHTML = '';        
        subs.forEach(sub => {
            const li = document.createElement('li');
            li.className = 'sub-nav-item';
            if (activePodcast && activePodcast.id === sub.id) li.classList.add('active');
            
            const img = document.createElement('img');
            img.src = sub.artwork || '';
            img.onerror = () => {
                img.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23374151'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='40' fill='white'%3E${getPodcastInitial(sub.title)}%3C/text%3E%3C/svg%3E`;
            };

            const titleSpan = document.createElement('span');
            titleSpan.className = 'truncate';
            titleSpan.style.flexGrow = '1';
            titleSpan.textContent = sub.title;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-small danger-text';
            removeBtn.style.background = 'transparent';
            removeBtn.style.border = 'none';
            removeBtn.style.padding = '0 0.5rem';
            removeBtn.style.opacity = '0.5';
            removeBtn.innerHTML = '&times;';

            li.appendChild(img);
            li.appendChild(titleSpan);
            li.appendChild(removeBtn);
            
            li.onclick = (e) => {
                if (e.target.tagName === 'BUTTON') {
                    if (confirm(`Remove ${sub.title}?`)) {
                        removeEpisodesBySubId(sub.id);
                        removeSubscription(sub.id);
                        renderSubscriptions();
                        if (activePodcast?.id === sub.id) switchView('home-view');
                    }
                    return;
                }
                playClick();
                showPodcast(sub);
                document.querySelectorAll('.sub-nav-item').forEach(i => i.classList.remove('active'));
                li.classList.add('active');
            };
            sidebarSubsList.appendChild(li);
        });

        document.getElementById('stat-shows').textContent = subs.length;
        await updateCacheCounter();
    }

    async function updateCacheCounter() {
        const episodes = await getAllEpisodes();
        const cached = episodes.filter(e => e.status === 'downloaded' && e.blob);
        const totalBytes = cached.reduce((acc, curr) => acc + (curr.blob?.size || 0), 0);
        const mb = (totalBytes / (1024 * 1024)).toFixed(1);
        
        document.getElementById('cache-status').textContent = cached.length;
        document.getElementById('stat-size').textContent = `${mb} MB`;
        document.getElementById('storage-text').textContent = `${mb} MB`;
        document.getElementById('storage-fill').style.width = `${Math.min((totalBytes / (500 * 1024 * 1024)) * 100, 100)}%`;

        // Update Pending Sync List
        const pendingList = document.getElementById('pending-sync-list');
        if (pendingList) {
            pendingList.innerHTML = '';
            
            if (isDeviceConnected && currentDirHandle) {
                try {
                    const podcastsDir = await currentDirHandle.getDirectoryHandle('Podcasts', { create: true });
                    const pendingEpisodes = [];
                    
                    const subs = await getSubscriptions();
                    const subMap = new Map(subs.map(s => [Number(s.id), s.title]));

                    for (const ep of cached) {
                        let showTitle = null;
                        if (ep.subId) {
                            showTitle = subMap.get(Number(ep.subId));
                        }
                        if (!showTitle) showTitle = ep.showTitle;

                        const safeShowName = generateFormattedFilename("{SHOW}", { showTitle: showTitle });
                        try {
                            const showDir = await podcastsDir.getDirectoryHandle(safeShowName, { create: false });
                            const files = await getDirectoryFiles(showDir);
                            
                            // Also need to re-generate the expected filename to see if it matches what's on disk
                            const template = templateInput.value || "{YYYY}{MM}{DD} - {TITLE}";
                            const expectedFilename = generateFormattedFilename(template, { 
                                pubDate: ep.pubDate, 
                                showTitle: showTitle, 
                                epTitle: ep.title 
                            }) + '.mp3';

                            if (!files.has(expectedFilename)) {
                                pendingEpisodes.push(ep);
                            }
                        } catch (e) {
                            // Show directory doesn't even exist, so it's definitely pending
                            pendingEpisodes.push(ep);
                        }
                    }

                    if (pendingEpisodes.length === 0) {
                        pendingList.innerHTML = '<li style="padding: 1rem; color: var(--color-text-muted); font-size: 0.8rem;">DEVICE IS UP TO DATE</li>';
                    } else {
                        pendingEpisodes.forEach(ep => {
                            let showTitle = null;
                            if (ep.subId) {
                                showTitle = subMap.get(Number(ep.subId));
                            }
                            if (!showTitle) showTitle = ep.showTitle;

                            const li = document.createElement('li');
                            li.className = 'sub-nav-item';
                            li.style.cursor = 'default';
                            li.innerHTML = `
                                <div style="display:flex; flex-direction:column; overflow:hidden;">
                                    <span class="truncate" style="font-weight:700; color:#fff;">${ep.title}</span>
                                    <span class="truncate" style="font-size:0.7rem; opacity:0.6;">${showTitle}</span>
                                </div>
                            `;
                            pendingList.appendChild(li);
                        });
                    }
                } catch (err) {
                    console.error('Error updating pending list:', err);
                }
            } else {
                pendingList.innerHTML = '<li style="padding: 1rem; color: var(--color-text-muted); font-size: 0.8rem;">CONNECT DEVICE TO SYNC</li>';
            }
        }
    }

    async function cacheEpisode(subId, showTitle, episode) {
        console.group(`📥 CACHING EPISODE: ${episode.title}`);
        playClick();
        
        syncOverlay.classList.remove('hidden');
        syncOverlay.classList.add('active'); // Show dropdown when starting
        syncOverlayTitle.textContent = 'DOWNLOADING';
        syncShowName.textContent = showTitle;
        syncSubtitle.textContent = episode.title;
        syncBar.style.width = '0%';
        syncMeta.textContent = '0%';

        try {
            console.log(`📡 Downloading from: ${episode.enclosureUrl}`);
            let blob = await downloadEpisodeBlob(episode.enclosureUrl, (percent) => {
                syncBar.style.width = `${percent}%`;
                syncMeta.textContent = `${percent}%`;
            });

            if (!blob || blob.size < 1000) {
                throw new Error("Invalid audio data (file too small).");
            }

            console.log(`✅ Download complete (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);

            const template = templateInput.value || "{YYYY}{MM}{DD} - {TITLE}";
            const filename = generateFormattedFilename(template, { pubDate: episode.pubDate, showTitle, epTitle: episode.title }) + '.mp3';
            console.log(`📄 Generated filename: ${filename}`);
            
            console.log("💾 Saving to IndexedDB...");
            await saveEpisodeBlob({ 
                subId, 
                title: episode.title, 
                showTitle, 
                enclosureUrl: episode.enclosureUrl, 
                filename, 
                blob, 
                status: 'downloaded', 
                dateCached: new Date().toISOString(),
                pubDate: episode.pubDate // Store the actual release date
            });
            
            console.log("✨ Successfully cached in IndexedDB.");
            playSuccess();
            await updateCacheCounter();
            
            syncSubtitle.textContent = 'CACHED SUCCESSFULLY';
            setTimeout(() => {
                syncOverlay.classList.remove('active');
                setTimeout(() => syncOverlay.classList.add('hidden'), 500);
            }, 1000);

            // Trigger Auto-Sync if enabled
            const autoSync = await getSetting('auto_sync_to_device', 'false') === 'true';
            if (autoSync && isDeviceConnected) {
                console.log("🚀 Auto-sync triggered after individual download...");
                syncBtn.click();
            }
        } catch (e) {
            console.error("❌ Caching failed:", e);
            playError();
            syncSubtitle.textContent = `FAILED: ${e.message.substring(0, 30)}`;
            syncBar.style.width = '0%';
            setTimeout(() => {
                syncOverlay.classList.remove('active');
                setTimeout(() => syncOverlay.classList.add('hidden'), 500);
            }, 4000);
        }
        console.groupEnd();
    }

    addBtn.addEventListener('click', async () => {
        const input = rssInput.value.trim();
        if (!input) return;
        addBtn.disabled = true;
        addBtn.textContent = '...';
        
        try {
            if (input.startsWith('http')) {
                await processFeedAdd(input, '', true);
            } else {
                const results = await searchPodcasts(input);
                openSearchModal(results, async (url, art) => {
                    await processFeedAdd(url, art, true);
                });
            }
        } catch (e) {
            playError();
            alert(`Search failed: ${e.message}`);
        } finally {
            addBtn.disabled = false;
            addBtn.textContent = 'EXECUTE';
        }
    });

    rssInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addBtn.click();
    });

    async function processFeedAdd(url, art = '', navigate = true) {
        try {
            const feed = await fetchAndParseFeed(url);
            
            // 1. Check for existing subscription to preserve rules
            const allSubs = await getSubscriptions();
            const existing = allSubs.find(s => s.url === url);
            
            const globalDefault = await getSetting('global_sync_rule', 'auto_1');

            const sub = {
                url,
                title: existing ? existing.title : feed.title,
                artwork: feed.artwork || art || (existing ? existing.artwork : ''),
                downloadRule: existing ? existing.downloadRule : globalDefault
            };

            const subId = await addSubscription(sub);

            // 2. Apply Download Rule
            const rule = sub.downloadRule || 'auto_1';
            if (rule.startsWith('auto_')) {
                const count = parseInt(rule.split('_')[1], 10);
                const toDownload = feed.items.slice(0, count);

                // Get current cache and device state
                const cached = await getAllEpisodes();
                const cachedUrls = new Set(cached.map(e => e.enclosureUrl));
                const onDeviceUrls = new Set(cached.filter(e => e.status === 'on-device').map(e => e.enclosureUrl));

                const template = templateInput.value || "{YYYY}{MM}{DD} - {TITLE}";

                // Also check physical device if connected
                let deviceFiles = new Set();
                if (isDeviceConnected && currentDirHandle) {
                    try {
                        const podcastsDir = await currentDirHandle.getDirectoryHandle('Podcasts', { create: true });
                        const showDir = await podcastsDir.getDirectoryHandle(sub.title, { create: true });
                        deviceFiles = await getDirectoryFiles(showDir);
                    } catch (e) {}
                }

                for (const item of toDownload) {
                    const expectedFilename = generateFormattedFilename(template, {
                        pubDate: item.pubDate,
                        showTitle: sub.title,
                        epTitle: item.title
                    }) + '.mp3';

                    const alreadyInCache = cachedUrls.has(item.enclosureUrl);
                    const alreadyOnDeviceDB = onDeviceUrls.has(item.enclosureUrl);
                    const alreadyOnDeviceFS = deviceFiles.has(expectedFilename);

                    if (!alreadyInCache && !alreadyOnDeviceDB && !alreadyOnDeviceFS) {
                        await cacheEpisode(subId, sub.title, item);
                    } else {                        console.log(`⏭️ Skipping ${item.title} - already present in cache or on device.`);
                    }
                }
            }

            rssInput.value = '';
            await renderSubscriptions();

            // Auto-Sync after add/refresh if enabled
            const autoSync = await getSetting('auto_sync_to_device', 'false') === 'true';
            if (autoSync && isDeviceConnected) {
                console.log("🚀 Auto-sync triggered after feed add/refresh...");
                syncBtn.click();
            }

            // 3. Automatically navigate to the new podcast
            if (subId && navigate) {
                const subs = await getSubscriptions();
                const newSub = subs.find(s => s.id === subId);
                if (newSub) await showPodcast(newSub);
            }
        } catch (e) {
            console.error('Failed to process feed:', e);
        }
    }

    // --- Device Persistence ---

    async function checkPersistentDevice() {
        const handle = await getSavedDeviceHandle();
        if (handle) {
            if (await verifyPermission(handle, false)) await setDeviceConnected(handle);
            else {
                connectDeviceBtn.textContent = 'ACTIVATE USB DRIVE';
            }
        }
    }

    async function setDeviceConnected(handle) {
        currentDirHandle = handle;
        isDeviceConnected = true;
        deviceStatusDot.classList.add('connected');
        syncActiveArea.classList.remove('hidden');
        deviceConnCTA.classList.add('hidden');
        document.getElementById('stat-device').textContent = 'ONLINE';
        document.getElementById('stat-device').className = 'stat-value success';
        await saveDeviceHandle(handle);

        // Try to load config from device
        const deviceConfig = await loadConfigFromDevice(handle);
        if (deviceConfig) {
            console.log('📂 Device config found, merging data...');
            
            // 1. Sync Settings from Device
            if (deviceConfig.settings) {
                console.log('⚙️ Restoring settings from device...');
                const s = deviceConfig.settings;
                if (s.filename_template) {
                    await setSetting('filename_template', s.filename_template);
                    templateInput.value = s.filename_template;
                }
                if (s.proxy_url) {
                    await setSetting('proxy_url', s.proxy_url);
                    proxyUrlInput.value = s.proxy_url;
                }
                if (s.transcode_bitrate) {
                    await setSetting('transcode_bitrate', s.transcode_bitrate);
                    bitrateSelect.value = s.transcode_bitrate;
                }
                if (s.global_sync_rule) {
                    await setSetting('global_sync_rule', s.global_sync_rule);
                    if (globalRuleSelect) globalRuleSelect.value = s.global_sync_rule;
                }
                if (s.auto_refresh_on_load) {
                    await setSetting('auto_refresh_on_load', s.auto_refresh_on_load);
                    const check = document.getElementById('setting-auto-refresh');
                    if (check) check.checked = s.auto_refresh_on_load === 'true';
                }
                if (s.auto_sync_to_device) {
                    await setSetting('auto_sync_to_device', s.auto_sync_to_device);
                    const check = document.getElementById('setting-auto-sync');
                    if (check) check.checked = s.auto_sync_to_device === 'true';
                }
                if (s.generate_m3u) {
                    await setSetting('generate_m3u', s.generate_m3u);
                    const check = document.getElementById('setting-generate-m3u');
                    if (check) check.checked = s.generate_m3u === 'true';
                }
                if (s.theme) {
                    localStorage.setItem('retrofeed_theme', s.theme);
                    themeSelect.value = s.theme;
                    applyTheme(s.theme);
                }
            }

            // 2. Sync Subscriptions from Device
            if (deviceConfig.subscriptions) {
                const existingSubs = await getSubscriptions();
                const existingUrls = new Set(existingSubs.map(s => s.url));
                
                let addedCount = 0;
                for (const sub of deviceConfig.subscriptions) {
                    if (!existingUrls.has(sub.url)) {
                        await addSubscription(sub);
                        addedCount++;
                    }
                }
                if (addedCount > 0) {
                    console.log(`✨ Restored ${addedCount} subscriptions from device.`);
                    await renderSubscriptions();
                }
            }
        }

        await updateCacheCounter();
    }

    connectDeviceBtn.onclick = async () => {
        if (!checkFileSystemSupport()) return;
        playClick();
        try {
            const handle = await getSavedDeviceHandle() || (await getDriveHandle()).rootHandle;
            if (await verifyPermission(handle, true)) await setDeviceConnected(handle);
        } catch (e) { 
            console.error("Failed to acquire device handle:", e);
        }
    };

    syncBtn.onclick = async () => {
        if (!isDeviceConnected) {
            console.warn("⚠️ Sync attempted but device is not connected.");
            return;
        }
        
        console.group('🔄 SYNC OPERATION STARTED');
        syncBtn.disabled = true;
        syncOverlay.classList.remove('hidden');
        syncOverlay.classList.add('active'); // Auto-show dropdown on start
        syncOverlayTitle.textContent = 'SYNCING TO DEVICE';
        syncBar.style.width = '0%';
        syncSubtitle.textContent = 'Preparing files...';
        syncShowName.textContent = 'Multi-show Sync';
        syncMeta.textContent = '0 EPISODES REMAINING';
        
        syncAbortController = new AbortController();
        
        try {
            const allEpisodes = await getAllEpisodes();
            let episodes = allEpisodes.filter(e => e.status === 'downloaded' && e.blob);
            
            // Sort by publication date: Oldest to Newest
            episodes.sort((a, b) => new Date(a.pubDate || a.dateCached || 0) - new Date(b.pubDate || b.dateCached || 0));
            
            if (episodes.length === 0) {
                alert("No episodes found in cache to sync.");
                syncBtn.disabled = false;
                syncOverlay.classList.add('hidden');
                console.groupEnd();
                return;
            }

            const podcastsDir = await currentDirHandle.getDirectoryHandle('Podcasts', { create: true });
            const subs = await getSubscriptions();
            const template = templateInput.value || "{YYYY}{MM}{DD} - {TITLE}";

            await syncEpisodesToDrive(podcastsDir, episodes, subs, (cur, tot, filename, currentShow, remaining) => {
                const percent = Math.round((cur / tot) * 100);
                syncBar.style.width = `${percent}%`;
                syncShowName.textContent = currentShow || 'Syncing...';
                syncSubtitle.textContent = filename || 'Writing file...';
                syncMeta.textContent = `${tot - cur} EPISODES REMAINING`;

                // Update Backlog UI
                const backlogList = document.getElementById('sync-backlog-list');
                if (backlogList && remaining) {
                    backlogList.innerHTML = '';
                    remaining.forEach(ep => {
                        const li = document.createElement('li');
                        li.className = 'sub-nav-item';
                        li.style.cursor = 'default';
                        li.style.padding = '0.2rem 0.5rem';
                        li.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                        li.innerHTML = `
                            <div style="display:flex; flex-direction:column; overflow:hidden;">
                                <span class="truncate" style="font-weight:700; color:rgba(255,255,255,0.7);">${ep.title}</span>
                                <span class="truncate" style="font-size:0.6rem; opacity:0.4;">${ep.showTitle}</span>
                            </div>
                        `;
                        backlogList.appendChild(li);
                    });

                    if (remaining.length === 0) {
                        backlogList.innerHTML = '<li style="padding: 0.5rem; color: var(--color-accent); font-size: 0.6rem; text-align: center;">FINALIZING...</li>';
                    }
                }
            }, syncAbortController.signal, async (ep) => {
                await markEpisodeAsOnDevice(ep.enclosureUrl);
            }, template);

            // Generate M3U playlist if enabled
            const shouldGenerateM3U = await getSetting('generate_m3u', 'false') === 'true';
            if (shouldGenerateM3U) {
                syncSubtitle.textContent = 'Updating playlists...';
                const allEpsMetadata = await getAllEpisodes();
                await generateDevicePlaylist(podcastsDir, allEpsMetadata);
            }
            
            console.log("🎉 Sync process finished successfully!");
            playSuccess();
            await updateCacheCounter();
            if (activePodcast) await showPodcast(activePodcast);
            
            syncSubtitle.textContent = 'SYNC COMPLETE!';
            syncBar.style.width = '100%';
            setTimeout(() => {
                syncOverlay.classList.remove('active');
                setTimeout(() => syncOverlay.classList.add('hidden'), 500);
            }, 1500);

        } catch (e) { 
            if (e.message === 'SYNC_ABORTED') {
                console.log("🛑 Sync was aborted by the user.");
            } else {
                console.error("❌ Sync failed:", e);
                playError(); 
                alert(`Sync failed: ${e.message}`);
            }
            syncOverlay.classList.add('hidden');
        }
        
        syncBtn.disabled = false;
        console.groupEnd();
    };

    syncAbortBtn.onclick = () => {
        if (syncAbortController) {
            syncAbortController.abort();
            syncSubtitle.textContent = 'ABORTING...';
        }
    };

    clearDeviceBtn.onclick = async () => {
        if (!isDeviceConnected) return;
        if (confirm("Wipe /Podcasts folder?")) {
            const podcastsDir = await currentDirHandle.getDirectoryHandle('Podcasts', { create: true });
            await clearDirectory(podcastsDir);
            playSuccess();
        }
    };

    clearCacheBtn.onclick = async () => {
        if (confirm("Purge local cache?")) {
            await clearEpisodeCache();
            await updateCacheCounter();
        }
    };

    rebuildPlaylistsBtn.onclick = async () => {
        if (!isDeviceConnected || !currentDirHandle) {
            alert("Please connect your USB device first.");
            return;
        }

        try {
            const originalText = rebuildPlaylistsBtn.textContent;
            rebuildPlaylistsBtn.disabled = true;
            rebuildPlaylistsBtn.textContent = 'REBUILDING...';
            
            const podcastsDir = await currentDirHandle.getDirectoryHandle('Podcasts', { create: true });
            const allEpsMetadata = await getAllEpisodes();
            await generateDevicePlaylist(podcastsDir, allEpsMetadata);
            
            playSuccess();
            rebuildPlaylistsBtn.textContent = 'DONE!';
            setTimeout(() => {
                rebuildPlaylistsBtn.disabled = false;
                rebuildPlaylistsBtn.textContent = originalText;
            }, 2000);
        } catch (e) {
            console.error("Manual playlist rebuild failed:", e);
            playError();
            rebuildPlaylistsBtn.disabled = false;
            rebuildPlaylistsBtn.textContent = 'REBUILD FAILED';
        }
    };

    function updatePremiumUI() {
        const sess = getSession();
        document.getElementById('premium-status-text').textContent = sess?.isPremium ? "PREMIUM" : "FREE";
    }
});
