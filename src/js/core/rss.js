import { getSetting } from './db.js';

/**
 * RSS parsing logic for Retrofeed
 */

export async function getProxyBase() {
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

/**
 * Fetches and parses an RSS feed URL.
 * 
 * @param {string} feedUrl 
 * @returns {Promise<Object>} An object containing channel title and items
 */
export async function fetchAndParseFeed(feedUrl) {
    // Local CORS proxy as a reliable fallback
    const localProxyBase = await getProxyBase();
    const proxies = [
        '', // Try direct first
        localProxyBase,
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?'
    ];

    let lastError = null;

    for (const proxy of proxies) {
        try {
            const url = proxy ? (proxy + encodeURIComponent(feedUrl)) : feedUrl;
            console.log(`🌐 Attempting fetch via "${proxy || 'Direct'}": ${url}`);
            
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`📡 Proxy "${proxy}" returned status: ${response.status}`);
                throw new Error(`HTTP ${response.status}`);
            }
            
            const text = await response.text();
            if (!text || text.length < 100) {
                console.warn(`📡 Proxy "${proxy}" returned suspiciously short response.`);
                throw new Error('Empty or invalid response');
            }
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, "text/xml");
            
            if (xmlDoc.querySelector('parsererror')) throw new Error('XML Parse Error');

            const channel = xmlDoc.querySelector('channel');
            if (!channel) throw new Error('Missing <channel>');

            // Super robust channel title extraction
            let channelTitle = 'Unknown Podcast';
            const possibleTitles = [
                channel.querySelector('title'),
                xmlDoc.querySelector('rss > title'),
                xmlDoc.querySelector('feed > title'), // Atom support
                xmlDoc.querySelector('title')
            ];

            for (const t of possibleTitles) {
                if (t && t.textContent && t.textContent.trim()) {
                    channelTitle = t.textContent.trim();
                    break;
                }
            }

            // Super robust artwork extraction
            let artwork = '';
            
            const getTagAttr = (parent, tagName, attr) => {
                const tag = parent.getElementsByTagName(tagName)[0] || 
                            parent.querySelector(tagName.replace(':', '\\:'));
                return tag ? tag.getAttribute(attr) : null;
            };

            const getTagText = (parent, tagName) => {
                let tag;
                if (tagName.includes('>')) {
                    tag = parent.querySelector(tagName);
                } else {
                    tag = parent.getElementsByTagName(tagName)[0] || 
                          parent.querySelector(tagName.replace(':', '\\:'));
                }
                return tag ? tag.textContent : null;
            };

            const artworkPaths = [
                getTagAttr(channel, 'itunes:image', 'href'),
                getTagText(channel, 'image > url'),
                getTagText(channel, 'logo'), // Atom
                getTagText(channel, 'icon')
            ];

            for (const path of artworkPaths) {
                if (path && path.trim()) {
                    artwork = path.trim();
                    break;
                }
            }

            const items = Array.from(channel.querySelectorAll('item'));
            const parsedItems = items.map(item => {
                const title = item.querySelector('title')?.textContent || 'Untitled Episode';
                const enclosure = item.querySelector('enclosure');
                const enclosureUrl = enclosure ? enclosure.getAttribute('url') : null;
                const enclosureType = enclosure ? enclosure.getAttribute('type') : null;
                const pubDate = item.querySelector('pubDate')?.textContent || 
                                item.querySelector('date')?.textContent || 
                                item.querySelector('lastBuildDate')?.textContent || null;

                return { title, enclosureUrl, enclosureType, pubDate };
            }).filter(item => item.enclosureUrl && item.enclosureType && item.enclosureType.includes('audio/mpeg'));

            return { title: channelTitle, artwork: artwork, items: parsedItems };
        } catch (error) {
            console.warn(`Fetch failed with proxy "${proxy}":`, error);
            lastError = error;
        }
    }

    throw lastError || new Error('All fetch attempts failed');
}

/**
 * Searches the iTunes API for podcasts matching the query.
 * 
 * @param {string} query 
 * @returns {Promise<Array>} An array of podcast objects
 */
export async function searchPodcasts(query) {
    const localProxyBase = await getProxyBase();
    const proxies = [
        '', // Try direct first
        localProxyBase,
        'https://api.allorigins.win/raw?url='
    ];

    let lastError = null;

    for (const proxy of proxies) {
        try {
            const baseUrl = `https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(query)}&limit=10`;
            const url = proxy ? (proxy + encodeURIComponent(baseUrl)) : baseUrl;
            console.log(`Searching iTunes with proxy "${proxy}": ${url}`);
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`iTunes API error: ${response.status}`);
            }
            const data = await response.json();
            return data.results.map(result => ({
                title: result.collectionName,
                author: result.artistName,
                feedUrl: result.feedUrl,
                artwork: result.artworkUrl100
            }));
        } catch (error) {
            console.warn(`Search failed with proxy "${proxy}":`, error);
            lastError = error;
        }
    }
    
    throw lastError || new Error('All search attempts failed');
}
