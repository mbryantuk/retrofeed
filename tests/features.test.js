const puppeteer = require('puppeteer');

let browser;
let page;

const APP_URL = 'https://127.0.0.1:3000?dev=true';

jest.setTimeout(60000); // 60 seconds

beforeAll(async () => {
    console.log("Launching browser...");
    browser = await puppeteer.launch({
        headless: "new",
        executablePath: '/usr/bin/chromium',
        args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    console.log("Navigating to app...");
    await page.goto(APP_URL);
    await page.waitForSelector('#auth-mode-text');
    
    // Register a fresh test user
    const testUser = 'testfeat_' + Date.now();
    console.log(`Registering user: ${testUser}`);
    await page.click('#auth-mode-text');
    await page.type('#username-input', testUser);
    await page.type('#password-input', 'password123');
    await page.click('#register-btn');
    
    // Wait for success message
    console.log("Waiting for registration success message...");
    await page.waitForFunction(() => {
        const err = document.getElementById('auth-error');
        return err && err.textContent.includes('Registration successful');
    }, { timeout: 10000 });

    // Wait for mode switch (the 2s timeout in app.js)
    console.log("Waiting for mode switch to login...");
    await page.waitForSelector('#login-btn:not(.hidden)', { timeout: 10000 });
    
    console.log("Logging in...");
    // Clear inputs just in case
    await page.click('#username-input', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type('#username-input', testUser);
    
    await page.click('#password-input', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type('#password-input', 'password123');
    
    await page.click('#login-btn');
    await page.waitForSelector('#app-container:not(.hidden)', { timeout: 10000 });
    console.log("Login successful!");
});

afterAll(async () => {
    if (browser) await browser.close();
});

describe('Retrofeed Feature Suite', () => {

    test('Podcast Search should show results', async () => {
        await page.type('#rss-input', 'Daily');
        await page.click('#add-btn');
        
        await page.waitForSelector('#search-modal:not(.hidden)', { timeout: 15000 });
        
        const title = await page.$eval('#search-modal .modal-title', el => el.textContent);
        expect(title).toBe('Search Results');
    });

    test('Selecting a search result should add a podcast', async () => {
        await page.click('#search-results-list li:first-child');
        
        await page.waitForFunction(() => {
            return document.getElementById('sidebar-subs-list').children.length > 0;
        }, { timeout: 10000 });

        const subsCount = await page.$$eval('#sidebar-subs-list li', els => els.length);
        expect(subsCount).toBeGreaterThan(0);
    });

    test('Clicking a podcast should open the podcast view', async () => {
        await page.click('#sidebar-subs-list li:first-child');
        await page.waitForSelector('#podcast-view:not(.hidden)', { timeout: 10000 });
        
        const viewTitle = await page.$eval('#view-podcast-title', el => el.textContent);
        expect(viewTitle.length).toBeGreaterThan(0);
    });

    test('Global Settings should persist after reload', async () => {
        const customTemplate = '{TITLE}_{YYYY}';
        
        await page.click('#nav-settings');
        await page.waitForSelector('#settings-view:not(.hidden)');
        
        await page.focus('#global-filename-template');
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await page.type('#global-filename-template', customTemplate);
        
        await page.keyboard.press('Enter');
        await page.keyboard.press('Tab'); 
        
        await new Promise(r => setTimeout(r, 1000));
        
        await page.goto(APP_URL);
        await page.waitForSelector('#app-container:not(.hidden)', { timeout: 10000 });
        
        await page.click('#nav-settings');
        await page.waitForSelector('#settings-view:not(.hidden)', { timeout: 15000 });
        
        const persistedValue = await page.$eval('#global-filename-template', el => el.value);
        expect(persistedValue).toBe(customTemplate);
    });

    test('Premium upgrade should unlock transcoding', async () => {
        const premiumStatus = await page.$eval('#premium-status-text', el => el.textContent);
        expect(premiumStatus).toContain('FREE');
        
        await page.click('#upgrade-premium-btn');
        
        await page.waitForFunction(() => {
            return document.getElementById('premium-status-text').textContent.includes('PREMIUM');
        }, { timeout: 5000 });
        
        const newStatus = await page.$eval('#premium-status-text', el => el.textContent);
        expect(newStatus).toContain('PREMIUM');
    });
});
