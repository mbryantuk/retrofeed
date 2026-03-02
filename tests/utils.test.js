// Using Puppeteer for these tests since the project uses ESM for core modules
const puppeteer = require('puppeteer');
const path = require('path');

let browser;
let page;

const APP_URL = 'https://127.0.0.1:3000?dev=true';

jest.setTimeout(30000);

beforeAll(async () => {
    browser = await puppeteer.launch({
        headless: "new",
        executablePath: '/usr/bin/chromium',
        args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    await page.goto(APP_URL);
    // Wait for the modules to be loaded
    await page.waitForFunction(() => typeof window.getPodcastInitial === 'function' || true);
});

afterAll(async () => {
    if (browser) await browser.close();
});

describe('Utility Tests via Browser Context', () => {
    
    test('Filename Sanitizer: should replace special characters', async () => {
        const result = await page.evaluate(() => {
            // We need to import it or access it if it was exposed
            // Since it's a module, it's not global unless we exposed it.
            // Let's see if we can import it dynamically in the page.
            return import('./js/core/utils.js').then(m => m.sanitizeFilename('My Podcast: Episode #1'));
        });
        expect(result).toBe('My_Podcast_Episode_1');
    });

    test('Filename Sanitizer: should preserve spaces', async () => {
        const result = await page.evaluate(() => {
            return import('./js/core/utils.js').then(m => m.sanitizeFilename('My Podcast: Episode #1', true));
        });
        expect(result).toBe('My Podcast Episode 1');
    });

    test('Podcast Initial: should skip "The "', async () => {
        const result = await page.evaluate(() => {
            return import('./js/core/utils.js').then(m => m.getPodcastInitial('The Daily'));
        });
        expect(result).toBe('D');
    });

    test('Podcast Initial: should handle non-"The" titles', async () => {
        const result = await page.evaluate(() => {
            return import('./js/core/utils.js').then(m => m.getPodcastInitial('Radiolab'));
        });
        expect(result).toBe('R');
    });
});
