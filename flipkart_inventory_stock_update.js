const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const fs = require('fs');
const path = require('path');
const { getExistingBrowser, launchBrowserForAccount } = require('./browser_manager');

// Read target account
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

const updatesPath = path.join(__dirname, 'inventory_stock_updates.csv');
function getInventoryUpdates() {
    try {
        if (!fs.existsSync(updatesPath)) {
            console.error(`Error: ${updatesPath} not found.`);
            return [];
        }
        const csv = fs.readFileSync(updatesPath, 'utf8');
        const lines = csv.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('sku,'));
        return lines.map(line => {
            const [sku, stock] = line.split(',');
            return { sku: sku.trim(), stock: parseInt(stock.trim(), 10) };
        }).filter(u => u.sku && !isNaN(u.stock));
    } catch (e) {
        console.error(`Error reading ${updatesPath}:`, e.message);
        return [];
    }
}

const otpStatusPath = path.join(__dirname, 'login_otp_status.json');
const sessionDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}
const sessionPath = path.join(sessionDir, `session_${username.replace(/[@.]/g, '_')}.json`);

(async () => {
    console.log(`\n=== Starting Flipkart Stock Update for Account: ${username} ===`);
    updateStatus('Updating Stock...');

    const updates = getInventoryUpdates();
    if (updates.length === 0) {
        console.log("No valid stock updates found in CSV. Exiting.");
        updateStatus('Logged In');
        process.exit(0);
    }
    console.log(`Loaded ${updates.length} stock updates from CSV.`);

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
            console.log("Browser closed. Exiting...");
            updateStatus('Logged Out');
            process.exit(0);
        });

        console.log("Navigating to Flipkart Seller Portal...");
        await page.goto('https://seller.flipkart.com/', { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(3000);

        let url = page.url();
        let loggedIn = url.includes('dashboard') || url.includes('index.html#') || (await page.locator('text=Active Listing').count() > 0) || (await page.locator('text=Pending Dispatch').count() > 0);

        if (!loggedIn) {
            console.log("Not logged in. Performing login procedure...");
            // Click Homepage Login Button if exists
            const loginBtn = page.locator('button:has-text("Login"), button.styles__ButtonStyle-sekd9q-0.klTPPh.sc-fznKkj.sc-pRTZB.gpyONI').first();
            if (await loginBtn.count() > 0) {
                await loginBtn.click();
                await page.waitForTimeout(3000);
            }

            // Wait for username input
            const usernameInput = page.locator('input.login, input[placeholder*="Username or phone number or email"]').first();
            await usernameInput.waitFor({ state: 'visible', timeout: 15000 });
            await usernameInput.fill(username);

            // Click Next button
            const nextBtn = page.locator('button:has-text("Next"), button.sc-pZCbX.guQvfx').first();
            await nextBtn.click();
            await page.waitForTimeout(2000);

            // Wait for password input
            const passwordInput = page.locator('input.password, input[placeholder*="Enter password"]').first();
            await passwordInput.waitFor({ state: 'visible', timeout: 15000 });
            await passwordInput.fill(password);

            // Click Login
            const loginSubmitBtn = page.locator('button:has-text("Login"), button.sc-pZCbX.guQvfx').first();
            await loginSubmitBtn.click();
            await page.waitForTimeout(5000);

            // Check for password error
            if (await page.locator('text=Incorrect password').count() > 0) {
                throw new Error("Incorrect password configuration.");
            }

            // Check if OTP input is present
            const isOtpScreen = async () => {
                const otpInputs = page.locator('input.otp-input');
                if (await otpInputs.count() > 0) return true;
                const content = await page.content();
                return content.includes('Verification Code') || content.includes('Enter OTP');
            };

            if (await isOtpScreen()) {
                console.log("OTP verification required!");
                updateStatus('OTP Required');

                fs.writeFileSync(otpStatusPath, JSON.stringify({
                    username: username,
                    status: 'WAITING_FOR_OTP',
                    timestamp: Date.now()
                }, null, 2));

                let otp = null;
                const maxPollAttempts = 90;
                for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
                    await page.waitForTimeout(2000);
                    if (fs.existsSync(otpStatusPath)) {
                        try {
                            const data = JSON.parse(fs.readFileSync(otpStatusPath, 'utf8'));
                            if (!data.status || data.status === '') {
                                console.log("OTP verification cancelled.");
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
                    throw new Error("OTP request timed out or cancelled.");
                }

                console.log("Received OTP. Submitting...");
                updateStatus('Updating Stock...');

                const otpInputs = page.locator('input.otp-input');
                const otpCount = await otpInputs.count();
                for (let i = 0; i < Math.min(otp.length, otpCount); i++) {
                    await otpInputs.nth(i).fill(otp[i]);
                    await page.waitForTimeout(100);
                }

                fs.writeFileSync(otpStatusPath, JSON.stringify({}));
                await page.waitForTimeout(5000);
            }

            url = page.url();
            loggedIn = url.includes('dashboard') || url.includes('index.html#') || (await page.locator('text=Active Listing').count() > 0) || (await page.locator('text=Pending Dispatch').count() > 0);
            if (!loggedIn) {
                throw new Error(`Login verification failed. Current page URL: ${url}`);
            }

            console.log("Login successful!");
            await context.storageState({ path: sessionPath });
        }

        // 3. Navigate to Inventory Dashboard via sidebar menu clean navigation
        console.log("Navigating to Inventory dashboard...");
        
        // Go to home-page first to guarantee fresh sidebar context
        const homeBtn = page.locator('a[href*="home-page"]').first();
        if (await homeBtn.isVisible()) {
            await homeBtn.click();
            await page.waitForTimeout(3000);
        }

        const inventoryBtn = page.locator('a[href*="unifiedInventoryNew"]').first();
        if (await inventoryBtn.isVisible()) {
            await inventoryBtn.click();
            await page.waitForTimeout(7000); // Wait for page location initialization
            console.log("Inventory page loaded. Current URL:", page.url());
        } else {
            console.log("Sidebar menu item 'Inventory' not found. Trying direct URL fallback...");
            await page.goto('https://seller.flipkart.com/index.html#dashboard/unifiedInventoryNew', { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(5000);
        }

        // Click Reset Search if visible to clear any previous search filter
        const resetBtn = page.locator('button:has-text("Reset Search"), span:has-text("Reset Search"), a:has-text("Reset Search")').first();
        if (await resetBtn.isVisible()) {
            console.log("Pre-existing search filter found. Resetting search...");
            await resetBtn.click();
            await page.waitForTimeout(3000);
        }

        // Click "All Inventory" tab to make sure it's active
        const allInventoryTab = page.locator('div[class*="TabLabel"], div, span').filter({ hasText: /^All Inventory$/ }).first();
        if (await allInventoryTab.isVisible()) {
            console.log("Selecting 'All Inventory' tab (inner label)...");
            await allInventoryTab.click();
            await page.waitForTimeout(3000);
        }

        // Save session state again
        try { await context.storageState({ path: sessionPath }); } catch (e) { }

        // Find the page-level Search box
        const searchBox = page.locator('input.simple-search-input, input[placeholder="Search"], input[placeholder*="Search"]').first();
        if (!searchBox) {
            throw new Error("Could not find the page-level Search box on Flipkart Inventory page.");
        }

        // 4. Update Stock for each SKU
        for (const updateItem of updates) {
            const { sku, stock } = updateItem;
            console.log(`Processing SKU: ${sku} -> stock: ${stock}`);

            try {
                // Fill search box sequentially to trigger key event listeners
                await searchBox.click();
                await page.keyboard.press('Control+A');
                await page.keyboard.press('Backspace');
                await page.waitForTimeout(500);
                await searchBox.pressSequentially(sku, { delay: 100 });
                await page.waitForTimeout(3000); // Wait for dropdown suggestions

                // Locate and click the specific SKU suggestion row (case-insensitive)
                const suggestionRegex = new RegExp(`Search SKU Id:\\s*${sku}`, 'i');
                const skuOption = page.locator('li.search-type-list-item').filter({ hasText: suggestionRegex }).first();
                if (await skuOption.isVisible()) {
                    await skuOption.click();
                } else {
                    console.log(`Suggestion "Search SKU Id: ${sku}" not visible. Pressing Enter as fallback...`);
                    await page.keyboard.press('Enter');
                }

                // Wait for the table search results to load
                console.log("Waiting for search results loading to complete...");
                await page.waitForTimeout(1000);
                const loader = page.locator('text=Loading, text=Loading..').first();
                try {
                    await loader.waitFor({ state: 'hidden', timeout: 15000 });
                    console.log("Loading completed!");
                } catch (e) {
                    console.log("Loader timeout or not visible.");
                }
                await page.waitForTimeout(3000); // Buffer for rendering

                // Find listing row
                const row = page.locator('tr, [class*="TableBodyTR"]').filter({ hasText: sku }).first();
                await row.waitFor({ state: 'visible', timeout: 15000 });

                // Locate Current stock column cell (the 2nd td/column element)
                const stockCell = row.locator('td').nth(1);

                // Find the pencil edit icon container inside the stock cell
                const pencilIcon = stockCell.locator('[class*="ClickableContainer"], [class*="ClickableElement"], i.fa-pencil').first();
                if (await pencilIcon.isVisible()) {
                    await pencilIcon.click({ force: true });
                } else {
                    await stockCell.click();
                }

                // Wait for the popup edit dialog input to appear
                const stockInput = page.locator('input[data-testid="test-input"], input[name*="Edit Stock Value"]').first();
                await stockInput.waitFor({ state: 'visible', timeout: 5000 });

                // Fill stock value
                await stockInput.click();
                await page.keyboard.press('Control+A');
                await page.keyboard.press('Backspace');
                await page.waitForTimeout(200);
                await stockInput.pressSequentially(stock.toString(), { delay: 100 });
                await page.waitForTimeout(500);

                // Click "Apply" button inside the dialog
                const applyBtn = page.locator('button.submitButton, button[class*="submitButton"]').first();
                await applyBtn.click();
                await page.waitForTimeout(3000); // Wait for save

                console.log(`✅ Success: SKU ${sku} stock updated to ${stock}.`);

            } catch (err) {
                console.error(`❌ Error updating SKU ${sku}:`, err.message);
            }
        }

        console.log("\n=== Flipkart Stock Update Completed ===");
        updateStatus('Logged In');

    } catch (err) {
        console.error("Global Error during stock update:", err.message);
        updateStatus('Error');
    } finally {
        // Keep the browser running if it was an existing session, otherwise close it
        if (!isExisting && browser) {
            await browser.close().catch(() => {});
        }
    }
})();
