const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getUserByUsername, createUser, getSubscriptions, syncSubscription, removeSubscription, setPremiumStatus } = require('./db.js');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-retrofeed-key';

// Middleware
app.use(express.json());
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    // Temporarily disabled for troubleshooting
    // res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    // res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    next();
});

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- Update Enforcement ---

// Serve static frontend files with strict cache control to ensure updates are checked
app.use(express.static(path.join(__dirname, '../src'), {
    maxAge: 0, // No browser caching of main files
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
        // Specifically for HTML/JS/CSS, we want the browser to always revalidate
        if (path.endsWith('.html') || path.endsWith('.js') || path.endsWith('.css')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// API for version checking
app.get('/api/version', (req, res) => {
    try {
        const versionData = require('../src/version.json');
        res.json(versionData);
    } catch (e) {
        res.status(500).json({ error: 'Could not read version file' });
    }
});

// Auth Endpoints
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password || username.length < 3 || password.length < 6) {
        return res.status(400).json({ error: 'Username (min 3) and password (min 6) required.' });
    }

    try {
        const existingUser = await getUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({ error: 'Username already exists.' });
        }

        await createUser(username, password);
        res.status(201).json({ message: 'Registration successful. You can now log in.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await getUserByUsername(username);
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );

        res.json({ 
            token, 
            username: user.username,
            isPremium: !!user.is_premium
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
        }
        });

        // Premium Endpoints
app.post('/api/premium/checkout', authenticateToken, async (req, res) => {
    try {
        // In a real app, you would create a Stripe checkout session here.
        // For this crunch, we will just simulate a successful purchase.
        await setPremiumStatus(req.user.id, true);
        res.json({ message: 'Account upgraded to PREMIUM successfully.', success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to upgrade account' });
    }
});

// Start a secure server if keys exist, otherwise fallback to HTTP
const https = require('https');
const fs = require('fs');

try {
    const options = {
        key: fs.readFileSync(path.join(__dirname, '../server.key')),
        cert: fs.readFileSync(path.join(__dirname, '../server.cert'))
    };
    https.createServer(options, app).listen(PORT, '0.0.0.0', () => {
        console.log(`[HTTPS] Retrofeed Server running on https://10.10.2.0:${PORT}`);
    });
} catch (e) {
    console.log("No SSL certs found. Falling back to HTTP.");
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[HTTP] Retrofeed Server running on http://10.10.2.0:${PORT}`);
    });
}
