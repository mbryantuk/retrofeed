/**
 * Real Authentication Module for Retrofeed
 * Stores JWT session in localStorage
 */

const SESSION_KEY = 'retrofeed_session';

export function getSession() {
    const session = localStorage.getItem(SESSION_KEY);
    return session ? JSON.parse(session) : null;
}

export async function login(username, password) {
    if (!username || !password) {
        throw new Error("Please enter both username and password.");
    }

    const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Login failed");
    }

    const sessionData = {
        username: data.username,
        token: data.token,
        isPremium: !!data.isPremium,
        loginDate: new Date().toISOString()
    };
    
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    return sessionData;
}

export async function upgradeToPremium() {
    const session = getSession();
    if (!session || !session.token) throw new Error("Authentication required");

    const response = await fetch('/api/premium/checkout', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${session.token}`,
            'Content-Type': 'application/json'
        }
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Upgrade failed");

    // Update local session
    session.isPremium = true;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return data.message;
}

export async function register(username, password) {
    if (!username || !password) {
        throw new Error("Please enter both username and password.");
    }

    const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Registration failed");
    }

    return data.message;
}

export function logout() {
    localStorage.removeItem(SESSION_KEY);
}
