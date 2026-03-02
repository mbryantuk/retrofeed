const puppeteer = require('puppeteer');
const sqlite3 = require('sqlite3');
const path = require('path');

let browser;
let page;

const APP_URL = 'https://127.0.0.1:3000?dev=true';

jest.setTimeout(30000);

// Helper to clear the database before tests
const clearDatabase = () => {
    return new Promise((resolve, reject) => {
        const dbPath = path.resolve(__dirname, '../server/db/users.sqlite');
        const db = new sqlite3.Database(dbPath);
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT,
                is_premium INTEGER DEFAULT 0
            )`);
            db.run('DELETE FROM users', (err) => {
                if (err) reject(err);
                else resolve();
                db.close();
            });
        });
    });
};

beforeAll(async () => {
    await clearDatabase();
    
    // Launch puppeteer with flag to ignore self-signed certs
    browser = await puppeteer.launch({
        headless: "new",
        executablePath: '/usr/bin/chromium',
        args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
});

afterAll(async () => {
    if (browser) {
        await browser.close();
    }
});

describe('Retrofeed Auth Flow', () => {

    test('Should show the login screen initially', async () => {
        await page.goto(APP_URL);
        
        const headerText = await page.$eval('.auth-header h1', el => el.textContent);
        expect(headerText).toBe('RETROFEED');
        
        const loginBtnVisible = await page.$eval('#login-btn', el => !el.classList.contains('hidden'));
        expect(loginBtnVisible).toBe(true);
    });

    test('Should allow user registration', async () => {
        // Click register link
        await page.click('#auth-mode-text');
        
        // Fill form
        await page.type('#username-input', 'testuser');
        await page.type('#password-input', 'securepassword');
        
        // Click Create Account
        await page.click('#register-btn');
        
        // Wait for success message or mode switch
        await page.waitForFunction(() => {
            const err = document.getElementById('auth-error');
            return err && err.textContent.includes('Registration successful');
        }, { timeout: 3000 });

        const errorText = await page.$eval('#auth-error', el => el.textContent);
        expect(errorText).toContain('Registration successful');
    });

    test('Should allow the new user to log in', async () => {
        // The UI automatically flips back to login after 2 seconds on success
        await page.waitForSelector('#login-btn:not(.hidden)', { timeout: 3000 });

        // Inputs should be clear from previous step or we can clear them
        await page.$eval('#username-input', el => el.value = '');
        await page.$eval('#password-input', el => el.value = '');

        // Log in
        await page.type('#username-input', 'testuser');
        await page.type('#password-input', 'securepassword');
        await page.click('#login-btn');

        // Wait for main app to appear
        await page.waitForSelector('#app-container:not(.hidden)', { timeout: 10000 });

        const greeting = await page.$eval('#user-greeting', el => el.textContent);
        expect(greeting).toBe('TESTUSER');
    });

    test('Should allow user to log out', async () => {
        await page.click('#logout-btn');
        
        // Wait for auth container to appear
        await page.waitForSelector('#auth-container:not(.hidden)');
        
        const loginBtnVisible = await page.$eval('#login-btn', el => !el.classList.contains('hidden'));
        expect(loginBtnVisible).toBe(true);
    });
});
