const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.resolve(__dirname, 'db', 'users.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Create users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        is_premium INTEGER DEFAULT 0
    )`);

    // Create subscriptions table for cloud sync
    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        url TEXT,
        title TEXT,
        latest_episode_title TEXT,
        enclosure_url TEXT,
        download_rule TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id),
        UNIQUE(user_id, url)
    )`);
});

// Helper functions
const getUserByUsername = (username) => {
    return new Promise((resolve, reject) => {
        db.get("SELECT id, username, password, is_premium FROM users WHERE username = ?", [username], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const createUser = async (username, plainPassword) => {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);

    return new Promise((resolve, reject) => {
        db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
    });
};

const getSubscriptions = (userId) => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM subscriptions WHERE user_id = ?", [userId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const syncSubscription = (userId, sub) => {
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO subscriptions (user_id, url, title, latest_episode_title, enclosure_url, download_rule) 
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, url) DO UPDATE SET 
                title=excluded.title, 
                latest_episode_title=excluded.latest_episode_title, 
                enclosure_url=excluded.enclosure_url, 
                download_rule=excluded.download_rule`, 
            [userId, sub.url, sub.title, sub.latestEpisodeTitle, sub.enclosureUrl, sub.downloadRule], 
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
};

const removeSubscription = (userId, url) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM subscriptions WHERE user_id = ? AND url = ?", [userId, url], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

const setPremiumStatus = (userId, status) => {
    return new Promise((resolve, reject) => {
        db.run("UPDATE users SET is_premium = ? WHERE id = ?", [status ? 1 : 0, userId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

module.exports = {
    getUserByUsername,
    createUser,
    getSubscriptions,
    syncSubscription,
    removeSubscription,
    setPremiumStatus
};
