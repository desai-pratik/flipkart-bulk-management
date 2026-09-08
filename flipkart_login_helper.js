const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const fs = require('fs');
const path = require('path');
const { getExistingBrowser, launchBrowserForAccount } = require('./browser_manager');

// Read targets
const targetAccount = process.env.TARGET_ACCOUNT;
if (!targetAccount) {
    console.error("TARGET_ACCOUNT env variable not set.");
    process.exit(1);
}

// Find credentials from accounts.csv
const csvPath = path.join(__dirname, 'accounts.csv');
let accounts = [];
try {
    if (fs.existsSync(csvPath)) {
        const csv = fs.readFileSync(csvPath, 'utf8');
        const lines = csv.split('\n').filter(l => l.trim().length > 0);
        for (let line of lines) {
            if (line.startsWith('username,')) continue;
            const parts = line.split(',');
            if (parts.length >= 2) {
                const username = parts[0].trim();
                const password = parts[1].trim();
                accounts.push({ username, password });
            }
        }
    }
} catch (e) {
    console.error("Failed to read accounts.csv:", e.message);
}

const account = accounts.find(a => a.username.toLowerCase() === targetAccount.toLowerCase());
if (!account) {
    console.error(`Account details for ${targetAccount} not found in accounts.csv.`);
    process.exit(1);
}

const username = account.username;
const password = account.password;

// Status helper
const statusPath = path.join(__dirname, 'accounts_login_status.json');
function updateStatus(status) {
    let statuses = {};
    if (fs.existsSync(statusPath)) {
        try { statuses = JSON.parse(fs.readFileSync(statusPath, 'utf8')); } catch (e) { }
    }
    statuses[username] = {
        status,
        timestamp: Date.now()
    };
    fs.writeFileSync(statusPath, JSON.stringify(statuses, null, 2), 'utf8');
    console.log(`STATUS_UPDATE:${username}:${status}`);
}

process.on('SIGINT', () => {
    console.log("Process SIGINT received. Logging out...");
    updateStatus('Logged Out');
    process.exit(0);
});
process.on('SIGTERM', () => {
    console.log("Process SIGTERM received. Logging out...");
    updateStatus('Logged Out');
    process.exit(0);
});

const otpStatusPath = path.join(__dirname, 'login_otp_status.json');

// Session storage state
const sessionDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}
const sessionPath = path.join(sessionDir, `session_${username.replace(/[@.]/g, '_')}.json`);

(async () => {
    updateStatus('Checking...');

    let browser;
    let isExisting = false;
    let context;
    let page;

    try {
        browser = await getExistingBrowser(username);
        if (browser) {
            isExisting = true;
            const contexts = browser.contexts();
            if (contexts.length > 0) {
                context = contexts[0];
                const pages = context.pages();
                if (pages.length > 0) {
                    page = pages[0];
                } else {
                    page = await context.newPage();
                }
            } else {
                context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
                page = await context.newPage();
            }
        } else {
            browser = await launchBrowserForAccount(username);
            context = await browser.newContext({
                storageState: fs.existsSync(sessionPath) ? sessionPath : undefined,
                viewport: { width: 1280, height: 800 }
            });
            page = await context.newPage();
        }

        browser.on('disconnected', () => {
            console.log("Browser disconnected/closed. Exiting script...");
            updateStatus('Logged Out');
            process.exit(0);
        });

        console.log("Navigating to Flipkart Seller Hub...");
        await page.goto('https://seller.flipkart.com/', { waitUntil: 'load', timeout: 60000 });

        // Wait a bit to check if we are redirected to dashboard
        await page.waitForTimeout(3000);

        let url = page.url();
        console.log("Current URL:", url);

        // Check if already logged in
        if (url.includes('dashboard') || url.includes('index.html#') || (await page.locator('text=Active Listing').count() > 0) || (await page.locator('text=Pending Dispatch').count() > 0)) {
            console.log("Already logged in!");
            updateStatus('Logged In');
            // Save state
            await context.storageState({ path: sessionPath });

            // Periodically save state
            setInterval(async () => {
                try { await context.storageState({ path: sessionPath }); } catch (e) { }
            }, 60000);

            console.log("Browser kept open. Keeping process alive...");
            await new Promise(() => { }); // Wait indefinitely
        }

        // If not logged in, we need to click the Login button on the homepage
        const loginBtn = page.locator('button:has-text("Login"), button.styles__ButtonStyle-sekd9q-0.klTPPh.sc-fznKkj.sc-pRTZB.gpyONI').first();
        if (await loginBtn.count() > 0) {
            console.log("Clicking Homepage Login Button...");
            await loginBtn.click();
            await page.waitForTimeout(3000);
        }

        // Wait for username input
        const usernameInput = page.locator('input.login, input[placeholder*="Username or phone number or email"]').first();
        await usernameInput.waitFor({ state: 'visible', timeout: 15000 });

        console.log("Entering username...");
        await usernameInput.fill(username);

        // Click Next button
        const nextBtn = page.locator('button:has-text("Next"), button.sc-pZCbX.guQvfx').first();
        console.log("Clicking Next...");
        await nextBtn.click();

        await page.waitForTimeout(2000);

        // Wait for password input
        const passwordInput = page.locator('input.password, input[placeholder*="Enter password"]').first();
        await passwordInput.waitFor({ state: 'visible', timeout: 15000 });

        console.log("Entering password...");
        await passwordInput.fill(password);

        // Click Login
        const loginSubmitBtn = page.locator('button:has-text("Login"), button.sc-pZCbX.guQvfx').first();
        console.log("Clicking Login/Submit...");
        await loginSubmitBtn.click();

        // Wait to see if we navigate to dashboard, or if OTP verification is requested, or if password error
        await page.waitForTimeout(5000);

        // Check for password error
        if (await page.locator('text=Incorrect password').count() > 0) {
            console.error("Incorrect password.");
            updateStatus('Logged Out');
            if (browser) {
                if (isExisting) await browser.disconnect();
                else await browser.close();
            }
            process.exit(1);
        }

        // Check if OTP input is present on screen
        const isOtpScreen = async () => {
            const otpInputs = page.locator('input.otp-input');
            const count = await otpInputs.count();
            if (count > 0) return true;
            const content = await page.content();
            return content.includes('Verification Code') || content.includes('Enter OTP');
        };

        if (await isOtpScreen()) {
            console.log("OTP verification screen detected!");
            updateStatus('OTP Required');

            // Write to login_otp_status.json
            fs.writeFileSync(otpStatusPath, JSON.stringify({
                username: username,
                status: 'WAITING_FOR_OTP',
                timestamp: Date.now()
            }, null, 2));

            // Poll for OTP received (wait up to 3 minutes)
            let otp = null;
            const maxPollAttempts = 90; // 90 * 2s = 180s = 3m
            for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
                await page.waitForTimeout(2000);

                // Read otp-status
                if (fs.existsSync(otpStatusPath)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(otpStatusPath, 'utf8'));
                        if (!data.status || data.status === '') {
                            console.log("OTP verification cancelled by user.");
                            break;
                        }
                        if (data.username === username && data.status === 'OTP_RECEIVED' && data.otp) {
                            otp = data.otp;
                            break;
                        }
                    } catch (e) { }
                }
            }

            if (!otp) {
                console.error("OTP request timed out or was cancelled.");
                updateStatus('Logged Out');
                // Clear OTP status
                fs.writeFileSync(otpStatusPath, JSON.stringify({}));
                if (browser) {
                    if (isExisting) await browser.disconnect();
                    else await browser.close();
                }
                process.exit(1);
            }

            console.log("Received OTP from user:", otp);
            updateStatus('Checking...');

            // Fill OTP into the 6 input.otp-input fields
            const otpInputs = page.locator('input.otp-input');
            const otpCount = await otpInputs.count();
            console.log(`Found ${otpCount} OTP inputs.`);
            for (let i = 0; i < Math.min(otp.length, otpCount); i++) {
                await otpInputs.nth(i).fill(otp[i]);
                await page.waitForTimeout(100);
            }

            // Clear OTP status file
            fs.writeFileSync(otpStatusPath, JSON.stringify({}));

            await page.waitForTimeout(5000);
        }

        // Wait and verify if we are now logged in
        url = page.url();
        console.log("Post-login URL:", url);
        if (url.includes('dashboard') || url.includes('index.html#') || (await page.locator('text=Active Listing').count() > 0) || (await page.locator('text=Pending Dispatch').count() > 0)) {
            console.log("Login successful!");
            updateStatus('Logged In');
            // Save state
            await context.storageState({ path: sessionPath });

            // Periodically save state
            setInterval(async () => {
                try { await context.storageState({ path: sessionPath }); } catch (e) { }
            }, 60000);

            console.log("Browser kept open. Keeping process alive...");
            await new Promise(() => { }); // Wait indefinitely
        } else {
            console.error("Failed to login. Current URL is:", url);
            updateStatus('Logged Out');
            if (browser) {
                if (isExisting) await browser.disconnect();
                else await browser.close();
            }
            process.exit(1);
        }

    } catch (err) {
        console.error("Error during automation execution:", err.message);
        updateStatus('Error');
        try {
            if (browser) {
                if (isExisting) await browser.disconnect();
                else await browser.close();
            }
        } catch (e) { }
        process.exit(1);
    }
})();
