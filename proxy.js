const http = require('http');
const https = require('https');
const url = require('url');

const port = 8080;
const host = '0.0.0.0';

const server = http.createServer((req, res) => {
    // 1. Setup CORS headers
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    // 2. Handle preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Max-Age': '86400',
            'Cross-Origin-Resource-Policy': 'cross-origin'
        });
        res.end();
        return;
    }

    // 3. Extract target URL from path
    let targetUrlStr = req.url.slice(1); 
    if (!targetUrlStr.startsWith('http')) {
        res.writeHead(400);
        res.end('Target URL must start with http/https');
        return;
    }

    // Comprehensive URL decoding
    try {
        targetUrlStr = decodeURIComponent(targetUrlStr);
    } catch(e) {}

    console.log(`Proxying request to: ${targetUrlStr}`);

    let targetUrl;
    try {
        targetUrl = new URL(targetUrlStr);
    } catch (e) {
        res.writeHead(400);
        res.end('Invalid Target URL');
        return;
    }

    const connector = targetUrl.protocol === 'https:' ? https : http;

    // Create a clean set of headers for the target
    const cleanHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
        // Skip auth/cookie headers that shouldn't leak or cause issues
        if (['authorization', 'cookie', 'host', 'connection'].includes(key.toLowerCase())) continue;
        cleanHeaders[key] = value;
    }
    cleanHeaders['host'] = targetUrl.hostname;
    cleanHeaders['connection'] = 'close';

    const proxyRequest = connector.request({
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers: cleanHeaders
    }, (proxyRes) => {
        // Copy headers and add CORS again to be sure
        const responseHeaders = { ...proxyRes.headers };
        
        // Remove target's CORS and security headers that might conflict with ours
        delete responseHeaders['access-control-allow-origin'];
        delete responseHeaders['access-control-allow-credentials'];
        delete responseHeaders['access-control-allow-methods'];
        delete responseHeaders['access-control-allow-headers'];
        delete responseHeaders['content-security-policy'];
        delete responseHeaders['x-frame-options'];

        responseHeaders['Access-Control-Allow-Origin'] = origin;
        responseHeaders['Cross-Origin-Resource-Policy'] = 'cross-origin';
        
        res.writeHead(proxyRes.statusCode, responseHeaders);
        proxyRes.pipe(res);
    });

    proxyRequest.on('error', (err) => {
        console.error('Proxy Error:', err);
        res.writeHead(502);
        res.end(`Proxy Error: ${err.message}`);
    });

    req.pipe(proxyRequest);
});

server.listen(port, host, () => {
    console.log(`Custom High-Reliability Proxy running on ${host}:${port}`);
});
