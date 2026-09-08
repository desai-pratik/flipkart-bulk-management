const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

// Deterministic port calculation based on username
function getPortForAccount(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Map to a port range 9000-9999
    return 9000 + Math.abs(hash % 1000);
}

// Check if port is open / browser is responsive and connect
async function getExistingBrowser(username) {
    const port = getPortForAccount(username);
    try {
        const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
        console.log(`[BrowserManager] Connected to existing browser session on port ${port} for ${username}`);
        return browser;
    } catch (err) {
        // Not running or not responsive
        return null;
    }
}

// Launch a new browser with CDP enabled
async function launchBrowserForAccount(username) {
    const port = getPortForAccount(username);
    console.log(`[BrowserManager] Launching new browser on port ${port} for ${username}`);
    
    // Launch headless as requested with full HD window size
    const browser = await chromium.launch({
        headless: true,
        args: [
            `--remote-debugging-port=${port}`,
            '--disable-blink-features=AutomationControlled',
            '--window-size=1920,1080',
            '--start-maximized',
            '--no-sandbox'
        ]
    });
    return browser;
}

module.exports = {
    getPortForAccount,
    getExistingBrowser,
    launchBrowserForAccount
};
