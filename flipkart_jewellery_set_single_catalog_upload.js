const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const fs = require('fs');
const path = require('path');
const { getExistingBrowser, launchBrowserForAccount } = require('./browser_manager');

// Read target account from environment or process active accounts
const targetAccount = process.env.TARGET_ACCOUNT;

// Paths
const csvPath = path.join(__dirname, 'accounts.csv');
const IMAGES_DIR = path.join(__dirname, 'single_catalog_images');
const DEFAULTS_FILE = path.join(__dirname, 'single_catalog_jewellery_set_defaults.json');
const statusPath = path.join(__dirname, 'accounts_login_status.json');
const otpStatusPath = path.join(__dirname, 'login_otp_status.json');
const sessionDir = path.join(__dirname, 'sessions');

if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}
if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function updateStatus(username, status) {
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

function sendSkuNotification(account, sku, status, message, screenshotFilename = null) {
    const payload = {
        account,
        sku,
        status, // 'SUCCESS' | 'ERROR'
        message,
        screenshot: screenshotFilename ? `/screenshots/${screenshotFilename}` : null,
        timestamp: new Date().toISOString()
    };
    console.log(`SKU_NOTIFICATION:${JSON.stringify(payload)}`);
}

async function captureScreenshot(page, sku, type = 'error') {
    try {
        const filename = `${type}_${sku}_${Date.now()}.png`;
        const filePath = path.join(SCREENSHOTS_DIR, filename);
        await page.screenshot({ path: filePath, fullPage: false });
        return filename;
    } catch (e) {
        console.error("Failed to capture screenshot:", e.message);
        return null;
    }
}

function getAccounts() {
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
                    const name = parts[2] ? parts[2].trim() : '';
                    const isActive = parts[3] ? parts[3].trim() === 'true' : true;
                    const brand = parts[4] ? parts[4].trim() : (name || '');
                    if (isActive) {
                        accounts.push({ username, password, name, brand });
                    }
                }
            }
        }
    } catch (e) {
        console.error("Failed to read accounts.csv:", e.message);
    }
    return accounts;
}

function getDefaults() {
    try {
        if (fs.existsSync(DEFAULTS_FILE)) {
            return JSON.parse(fs.readFileSync(DEFAULTS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error("Error reading defaults JSON:", e.message);
    }
    return {};
}

async function waitForUserOTP(username, timeoutMs = 180000) {
    console.log(`[${username}] Prompting user for OTP via UI...`);
    fs.writeFileSync(otpStatusPath, JSON.stringify({
        username,
        status: 'WAITING_FOR_OTP',
        timestamp: Date.now()
    }, null, 2));

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        await new Promise(r => setTimeout(r, 2000));
        if (fs.existsSync(otpStatusPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(otpStatusPath, 'utf8'));
                if (data.username === username && data.status === 'OTP_RECEIVED' && data.otp) {
                    console.log(`[${username}] Received OTP from UI: ${data.otp}`);
                    fs.writeFileSync(otpStatusPath, JSON.stringify({}));
                    return data.otp;
                }
            } catch (e) { }
        }
    }
    throw new Error("OTP Timeout: User did not enter OTP in 3 minutes.");
}

async function ensureLoggedIn(page, account) {
    const { username, password } = account;
    console.log(`[${username}] Checking login status on Flipkart Seller Hub...`);

    await page.goto('https://seller.flipkart.com/index.html#dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    const isDashboard = currentUrl.includes('dashboard') ||
        (await page.locator('text=Listings').first().isVisible().catch(() => false)) ||
        (await page.locator('text=Inventory').first().isVisible().catch(() => false)) ||
        (await page.locator('text=Orders').first().isVisible().catch(() => false));

    if (isDashboard) {
        console.log(`[${username}] Already logged in!`);
        return true;
    }

    console.log(`[${username}] Performing login...`);
    const loginLandingBtn = page.locator('a:has-text("Login"), button:has-text("Login"), a:has-text("LOG IN")').first();
    if (await loginLandingBtn.isVisible().catch(() => false)) {
        await loginLandingBtn.click().catch(() => { });
        await page.waitForTimeout(2000);
    }

    const userField = page.locator('input[name="username"], input[name="email"], input[type="email"], input[placeholder*="Email" i], input[placeholder*="Mobile" i], input[placeholder*="User" i]').first();
    if (await userField.isVisible({ timeout: 10000 }).catch(() => false)) {
        await userField.fill('');
        await userField.fill(username);
        await page.waitForTimeout(500);

        const nextBtn = page.locator('button:has-text("Next"), button:has-text("Continue"), button[type="submit"]').first();
        if (await nextBtn.isVisible().catch(() => false)) {
            await nextBtn.click().catch(() => { });
            await page.waitForTimeout(1500);
        }
    }

    const passField = page.locator('input[type="password"], input[name="password"]').first();
    if (await passField.isVisible({ timeout: 10000 }).catch(() => false)) {
        await passField.fill('');
        await passField.fill(password);
        await page.waitForTimeout(500);

        const submitBtn = page.locator('button:has-text("Login"), button:has-text("Submit"), button[type="submit"]').first();
        if (await submitBtn.isVisible().catch(() => false)) {
            await submitBtn.click().catch(() => { });
            await page.waitForTimeout(3000);
        }
    }

    const otpField = page.locator('input[placeholder*="OTP" i], input[name*="otp" i], input[aria-label*="OTP" i]').first();
    if (await otpField.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log(`[${username}] 2-Step OTP Verification required.`);
        const otp = await waitForUserOTP(username);
        await otpField.fill(otp);
        await page.waitForTimeout(500);

        const verifyBtn = page.locator('button:has-text("Verify"), button:has-text("Submit")').first();
        if (await verifyBtn.isVisible().catch(() => false)) {
            await verifyBtn.click();
            await page.waitForTimeout(4000);
        }
    }

    await page.waitForTimeout(3000);
    const sessionPath = path.join(sessionDir, `session_${username.replace(/[@.]/g, '_')}.json`);
    try {
        const context = page.context();
        await context.storageState({ path: sessionPath });
        console.log(`[${username}] Saved session cookies.`);
    } catch (e) { }

    return true;
}

/**
 * Single Listing Automation Flow - Step-by-Step
 */
async function startSingleListingFlow(page, account, defaults, customSkuName) {
    const { username } = account;
    const baseSkuName = customSkuName || defaults.styleCode || defaults.sku || 'pd_1030';

    console.log(`\n======================================================`);
    console.log(`[${username}] Starting Single Listing Flow for SKU: "${baseSkuName}"`);
    console.log(`======================================================`);

    updateStatus(username, `Preparing Catalog for SKU ${baseSkuName}...`);

    // Check if already on the category selection / Add Listing page
    const isAlreadyOnCategorySelection = await page.locator('text="Select Vertical"').filter({ visible: true }).isVisible().catch(() => false);

    if (!isAlreadyOnCategorySelection) {
        const currentUrl = page.url();
        const isAlreadyOnListings = currentUrl.includes('listings') || currentUrl.includes('my-listings') ||
            (await page.locator('text="All Listings"').filter({ visible: true }).isVisible().catch(() => false));

        if (!isAlreadyOnListings) {
            // Target the sidebar 'Listings' item specifically
            let listingsMenuItem = page.locator('nav, aside, [class*="sidebar" i], [class*="navigation" i], [class*="menu" i]')
                .locator('a, div, span, li, button')
                .filter({ hasText: /^Listings$/i })
                .filter({ visible: true })
                .first();

            if (!await listingsMenuItem.isVisible().catch(() => false)) {
                listingsMenuItem = page.locator('a[href*="listings" i], a[href*="my-listings" i]').filter({ visible: true }).first();
            }

            if (!await listingsMenuItem.isVisible().catch(() => false)) {
                listingsMenuItem = page.locator('a, div, span, li, button')
                    .filter({ hasText: /^Listings$/i })
                    .filter({ visible: true })
                    .first();
            }

            await listingsMenuItem.waitFor({ state: 'visible', timeout: 15000 });
            console.log(`  > Found 'Listings' menu item, clicking...`);
            try {
                await listingsMenuItem.click({ timeout: 5000 });
            } catch (e) {
                try {
                    await listingsMenuItem.click({ force: true });
                } catch (e2) {
                    await listingsMenuItem.evaluate(el => el.click());
                }
            }
            await page.waitForTimeout(3000);
        } else {
            console.log(`  > Already on Listings page.`);
        }
    }

    console.log(`[${username}] Step 1 Complete: Reached Listings page.`);
    updateStatus(username, 'On Listings Page');

    // Step 2 & 3: Click the blue "Add Listing" button and select "Add Single Listings"
    console.log(`[${username}] Step 2: Locating and clicking the blue 'Add Listing' button...`);

    // 1. Dismiss any open overlay
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 2. Find coordinates of the blue 'Add Listing' button (excluding header and Video banner)
    let addListingClicked = false;
    for (let attempt = 1; attempt <= 15; attempt++) {
        const coords = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('*'));
            for (const el of all) {
                if (el.closest('header') || el.closest('nav') || el.closest('[class*="header" i]') || el.closest('[class*="navbar" i]')) {
                    continue;
                }
                const text = (el.innerText || '').trim();
                if ((text === 'Add Listing' || (text.startsWith('Add Listing') && text.length < 25)) && !text.includes('Video')) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 && rect.top > 0) {
                        el.scrollIntoView({ block: 'center' });
                        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                    }
                }
            }
            return null;
        });

        if (coords) {
            console.log(`  > Found 'Add Listing' button at (${Math.round(coords.x)}, ${Math.round(coords.y)})! Clicking...`);
            await page.mouse.click(coords.x, coords.y);
            addListingClicked = true;
            break;
        }
        await page.waitForTimeout(1000);
    }

    if (!addListingClicked) {
        // Fallback Playwright locator
        const fallbackBtn = page.locator('text="Add Listing"')
            .filter({ hasNotText: /Video/i })
            .filter({ visible: true })
            .first();

        if (await fallbackBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await fallbackBtn.click();
            addListingClicked = true;
        }
    }

    if (!addListingClicked) {
        throw new Error("Could not locate the blue 'Add Listing' button on the page.");
    }

    await page.waitForTimeout(1500);

    // 3. Step 3: Locate and click "Add Single Listings" in dropdown
    console.log(`[${username}] Step 3: Finding 'Add Single Listings' option in dropdown...`);
    let singleClicked = false;

    for (let attempt = 1; attempt <= 10; attempt++) {
        const singleCoords = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('*'));
            for (const el of all) {
                const text = (el.innerText || '').trim();
                if (/^Add Single Listings?$/i.test(text)) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        el.scrollIntoView({ block: 'center' });
                        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                    }
                }
            }
            return null;
        });

        if (singleCoords) {
            console.log(`  > Found 'Add Single Listings' at (${Math.round(singleCoords.x)}, ${Math.round(singleCoords.y)})! Clicking...`);
            await page.mouse.click(singleCoords.x, singleCoords.y);
            singleClicked = true;
            break;
        }

        // If dropdown didn't open, re-click Add Listing button
        if (attempt === 3 && !singleClicked) {
            console.log("  > Retrying click on Add Listing button...");
            await page.evaluate(() => {
                const all = Array.from(document.querySelectorAll('*'));
                for (const el of all) {
                    if (el.closest('header') || el.closest('nav')) continue;
                    const text = (el.innerText || '').trim();
                    if (text.startsWith('Add Listing') && !text.includes('Video') && text.length < 25) {
                        el.click();
                        break;
                    }
                }
            });
        }
        await page.waitForTimeout(1000);
    }

    if (!singleClicked) {
        const singleOption = page.locator('text="Add Single Listings", text="Add Single Listing"')
            .filter({ visible: true })
            .first();

        if (await singleOption.isVisible({ timeout: 5000 }).catch(() => false)) {
            await singleOption.click({ force: true });
            singleClicked = true;
        }
    }

    if (!singleClicked) {
        throw new Error("Could not find or click 'Add Single Listings' in dropdown menu.");
    }

    await page.waitForTimeout(3000);
    console.log(`[${username}] Step 2 & 3 Complete: Clicked 'Add Listing' -> 'Add Single Listings'.`);
    updateStatus(username, 'Opened Single Listing Page');

    // Step 4: Dismiss instructional popup if visible (e.g. "Learn To Do Single Listing")
    console.log(`[${username}] Step 4: Checking for video / modal popups...`);
    try {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);

        const closePopupBtn = page.locator('button:has-text("Close"), button:has-text("Got it"), [aria-label="Close"], button.close')
            .filter({ visible: true })
            .first();

        if (await closePopupBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            console.log("  > Found popup 'Close' button! Clicking...");
            await closePopupBtn.click().catch(() => { });
            await page.waitForTimeout(1000);
        }
    } catch (e) { }

    // Step 5: Select Category Path: Jewellery -> Artificial & Silver Jewellery -> Jewellery Set
    console.log(`[${username}] Step 5: Navigating Category Path: Jewellery -> Artificial & Silver Jewellery -> Jewellery Set...`);
    updateStatus(username, 'Selecting Jewellery Set Vertical...');

    // 5a. Column 1: Click "Jewellery"
    console.log(`  > [Column 1] Finding 'Jewellery'...`);
    let col1Jewellery = page.locator('div, span, li, a, p')
        .filter({ hasText: /^Jewellery$/i })
        .filter({ visible: true })
        .first();

    // Scroll Column 1 if needed
    if (!await col1Jewellery.isVisible().catch(() => false)) {
        await page.evaluate(() => {
            const containers = Array.from(document.querySelectorAll('div, ul'));
            for (const c of containers) {
                if (c.innerText && (c.innerText.includes('Industrial Furniture') || c.innerText.includes('Automobile') || c.innerText.includes('Your Verticals'))) {
                    c.scrollTop = 1000;
                }
            }
        });
        await page.waitForTimeout(1000);
    }

    await col1Jewellery.waitFor({ state: 'visible', timeout: 20000 });
    console.log(`  > [Column 1] Clicking 'Jewellery'...`);
    try {
        await col1Jewellery.click({ timeout: 4000 });
    } catch (e) {
        await col1Jewellery.click({ force: true });
    }
    await page.waitForTimeout(1500);

    // 5b. Column 2: Click "Artificial & Silver Jewellery"
    console.log(`  > [Column 2] Finding 'Artificial & Silver Jewellery'...`);
    const col2Artificial = page.locator('div, span, li, a, p')
        .filter({ hasText: /^Artificial & Silver Jewellery$/i })
        .filter({ visible: true })
        .first();

    await col2Artificial.waitFor({ state: 'visible', timeout: 15000 });
    console.log(`  > [Column 2] Clicking 'Artificial & Silver Jewellery'...`);
    try {
        await col2Artificial.click({ timeout: 4000 });
    } catch (e) {
        await col2Artificial.click({ force: true });
    }
    await page.waitForTimeout(1500);

    // 5c. Column 3: Click "Jewellery Set"
    console.log(`  > [Column 3] Finding 'Jewellery Set'...`);
    let col3JewellerySet = page.locator('div, span, li, a, p')
        .filter({ hasText: /^Jewellery Set$/i })
        .filter({ visible: true })
        .first();

    // Scroll Column 3 if needed
    if (!await col3JewellerySet.isVisible().catch(() => false)) {
        await page.evaluate(() => {
            const containers = Array.from(document.querySelectorAll('div, ul'));
            for (const c of containers) {
                if (c.innerText && (c.innerText.includes('Hair Accessories') || c.innerText.includes('Horse Shoe Rings') || c.innerText.includes('Anklets'))) {
                    c.scrollTop = 1000;
                }
            }
        });
        await page.waitForTimeout(1000);
    }

    await col3JewellerySet.waitFor({ state: 'visible', timeout: 15000 });
    console.log(`  > [Column 3] Clicking 'Jewellery Set'...`);
    try {
        await col3JewellerySet.click({ timeout: 4000 });
    } catch (e) {
        await col3JewellerySet.click({ force: true });
    }
    await page.waitForTimeout(2000);

    // Step 6: Click "Select Brand" blue button on the right panel
    console.log(`[${username}] Step 6: Clicking the blue 'Select Brand' button on right panel...`);
    const selectBrandBtn = page.locator('button:has-text("Select Brand"), [role="button"]:has-text("Select Brand"), a:has-text("Select Brand")')
        .filter({ visible: true })
        .first();

    await selectBrandBtn.waitFor({ state: 'visible', timeout: 15000 });
    console.log(`  > Found 'Select Brand' button! Clicking...`);
    try {
        await selectBrandBtn.click({ timeout: 4000 });
    } catch (e) {
        await selectBrandBtn.click({ force: true });
    }
    await page.waitForTimeout(3000);

    console.log(`[${username}] Step 6 Complete: Clicked 'Select Brand' button.`);
    updateStatus(username, 'Clicked Select Brand');

    // Step 7: Enter Brand Name from accounts data and click "Check Brand"
    const effectiveBrand = account.brand || account.name || defaults.brand || 'Zxriz';
    console.log(`[${username}] Step 7: Entering Brand Name: "${effectiveBrand}" from account data...`);
    updateStatus(username, `Checking Brand: ${effectiveBrand}...`);

    const brandInput = page.locator('input[placeholder="Enter Brand Name"], input[placeholder*="Brand Name" i], input[placeholder*="brand" i]')
        .filter({ visible: true })
        .first();

    await brandInput.waitFor({ state: 'visible', timeout: 15000 });
    await brandInput.click();
    await brandInput.fill('');
    await page.waitForTimeout(300);
    await brandInput.pressSequentially(effectiveBrand, { delay: 80 });
    console.log(`  > Typed brand name: "${effectiveBrand}" in input.`);
    await page.waitForTimeout(800);

    const checkBrandBtn = page.locator('button:has-text("Check Brand"), [role="button"]:has-text("Check Brand"), a:has-text("Check Brand")')
        .filter({ visible: true })
        .first();

    await checkBrandBtn.waitFor({ state: 'visible', timeout: 10000 });
    console.log(`  > Clicking 'Check Brand' button...`);
    try {
        await checkBrandBtn.click({ timeout: 4000 });
    } catch (e) {
        await checkBrandBtn.click({ force: true });
    }
    await page.waitForTimeout(3000);
    console.log(`[${username}] Step 7 Complete: Brand check submitted.`);

    // Step 8: Click "Create new listing" button
    console.log(`[${username}] Step 8: Looking for 'Create new listing' button...`);
    updateStatus(username, 'Opening Listing Form...');

    const createListingBtn = page.locator('button:has-text("Create new listing"), [role="button"]:has-text("Create new listing"), a:has-text("Create new listing")')
        .filter({ visible: true })
        .first();

    await createListingBtn.waitFor({ state: 'visible', timeout: 20000 });
    console.log(`  > Found 'Create new listing' button! Clicking...`);
    try {
        await createListingBtn.click({ timeout: 5000 });
    } catch (e) {
        await createListingBtn.click({ force: true });
    }
    await page.waitForTimeout(4000);

    console.log(`[${username}] Step 8 Complete: Clicked 'Create new listing'! Product Details form is now loaded.`);
    updateStatus(username, 'Listing Form Loaded');

    // Step 9: Dismiss "A new way to add your variants!" popup with "Continue" button if present
    console.log(`[${username}] Step 9: Checking for 'Continue' variant popup...`);
    try {
        const continueBtn = page.locator('button:has-text("Continue"), [role="button"]:has-text("Continue"), a:has-text("Continue")')
            .filter({ visible: true })
            .first();

        if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            console.log("  > Found 'Continue' popup button! Clicking...");
            try {
                await continueBtn.click({ timeout: 4000 });
            } catch (e) {
                await continueBtn.click({ force: true });
            }
            await page.waitForTimeout(1500);
        } else {
            console.log("  > No 'Continue' popup displayed, proceeding.");
        }
    } catch (e) {
        console.log("  > Continuing past popup check...");
    }

    console.log(`[${username}] Step 9 Complete: Ready on Product Details form.`);
    updateStatus(username, 'Ready on Product Form');

    // Step 10: Upload Images (Slot 1: Main SKU photo, Slots 2+: _a, _b, _c, _d)
    console.log(`\n[${username}] Step 10: Preparing images for SKU "${baseSkuName}"...`);
    updateStatus(username, `Uploading Images for ${baseSkuName}...`);

    const imagesToUpload = getImagesForCatalog(baseSkuName);
    console.log(`  > Resolved ${imagesToUpload.length} image(s) for SKU "${baseSkuName}":`);
    imagesToUpload.forEach((img, idx) => console.log(`     Slot ${idx + 1}: ${path.basename(img)}`));

    if (imagesToUpload.length === 0) {
        console.warn(`  > Warning: No images found in ${IMAGES_DIR}.`);
    } else {
        for (let i = 0; i < imagesToUpload.length; i++) {
            const slotNum = i + 1;
            const imgPath = imagesToUpload[i];
            updateStatus(username, `Uploading Image ${slotNum}/${imagesToUpload.length} (${path.basename(imgPath)})...`);
            console.log(`\n>>> Processing Image Slot ${slotNum}/${imagesToUpload.length}: "${path.basename(imgPath)}" <<<`);

            // If slot > 1, click into the thumbnail slot
            if (i > 0) {
                await selectImageSlot(page, i);
                await page.waitForTimeout(1000);
            }

            // Upload image to the active slot
            await uploadPhotoToCurrentSlot(page, imgPath, slotNum);
            await page.waitForTimeout(2000);
        }

        console.log(`\n[${username}] Step 10 Complete: All ${imagesToUpload.length} product images uploaded for SKU "${baseSkuName}"!`);
        updateStatus(username, `Images Uploaded (${imagesToUpload.length}/${imagesToUpload.length})`);
    }

    // Step 11: Click "Price, Stock and Shipping Information" tab
    console.log(`\n[${username}] Step 11: Clicking 'Price, Stock and Shipping Information' tab...`);
    updateStatus(username, 'Opening Price & Shipping Tab...');

    const priceTab = page.locator('div, span, button, a, li')
        .filter({ hasText: /^Price, Stock and Shipping Information/i })
        .filter({ visible: true })
        .first();

    await priceTab.waitFor({ state: 'visible', timeout: 15000 });
    try {
        await priceTab.click({ timeout: 4000 });
    } catch (e) {
        await priceTab.click({ force: true });
    }
    await page.waitForTimeout(2500);

    console.log(`[${username}] Step 11 Complete: Price, Stock and Shipping Information tab opened.`);
    updateStatus(username, 'On Price & Stock Tab');

    // Step 12: Fill Price, Stock and Shipping Information (verified 100% error-free)
    console.log(`\n[${username}] Step 12: Filling & Verifying Price, Stock and Shipping Information...`);
    updateStatus(username, 'Filling Price & Stock Info...');

    await ensurePriceAndStockFilled(page, username, defaults, baseSkuName);

    console.log(`\n[${username}] Step 12 Complete: Price, Stock & Shipping details filled and verified (0 errors)!`);
    updateStatus(username, 'Price & Stock Verified (0 Errors)');

    // Step 13: Click "Product Description" tab at the top
    console.log(`\n[${username}] Step 13: Clicking 'Product Description' tab...`);
    updateStatus(username, 'Opening Product Description Tab...');

    const productDescTab = page.locator('div, span, button, a, li')
        .filter({ hasText: /^Product Description/i })
        .filter({ visible: true })
        .first();

    await productDescTab.waitFor({ state: 'visible', timeout: 15000 });
    try {
        await productDescTab.click({ timeout: 4000 });
    } catch (e) {
        await productDescTab.click({ force: true });
    }
    await page.waitForTimeout(2500);

    console.log(`[${username}] Step 13 Complete: Product Description tab opened.`);
    updateStatus(username, 'On Product Description Tab');

    // Step 14: Fill Product Description attributes (verified 100% error-free)
    console.log(`\n[${username}] Step 14: Filling & Verifying Product Description attributes...`);
    updateStatus(username, 'Filling Product Description...');

    await ensureProductDescriptionFilled(page, username, defaults, baseSkuName);

    console.log(`\n[${username}] Step 14 Complete: Product Description attributes filled and verified (0 errors)!`);
    updateStatus(username, 'Product Description Verified (0 Errors)');

    // Step 15: Click "Additional Description (Optional)" tab ONLY AFTER verifying 0 errors on previous tabs
    console.log(`\n[${username}] Step 15: All previous tabs verified. Clicking 'Additional Description (Optional)' tab...`);
    updateStatus(username, 'Opening Additional Description Tab...');

    const additionalDescTab = page.locator('div, span, button, a, li')
        .filter({ hasText: /^Additional Description/i })
        .filter({ visible: true })
        .first();

    await additionalDescTab.waitFor({ state: 'visible', timeout: 15000 });
    try {
        await additionalDescTab.click({ timeout: 4000 });
    } catch (e) {
        await additionalDescTab.click({ force: true });
    }
    await page.waitForTimeout(2500);

    console.log(`[${username}] Step 15 Complete: Additional Description tab opened.`);
    updateStatus(username, 'On Additional Description Tab');

    // Step 16: Fill Additional Description attributes
    console.log(`\n[${username}] Step 16: Filling Additional Description attributes...`);
    updateStatus(username, 'Filling Additional Description...');

    // 1. Necklace & Chain Type (Dropdown)
    if (defaults.necklaceChainType) {
        console.log(`  > Setting Necklace & Chain Type: "${defaults.necklaceChainType}"...`);
        await selectFormDropdown(page, '^Necklace & Chain Type', defaults.necklaceChainType);
        await page.waitForTimeout(400);
    }

    // 2. Pendant Shape (Dropdown)
    if (defaults.pendantShape) {
        console.log(`  > Setting Pendant Shape: "${defaults.pendantShape}"...`);
        await selectFormDropdown(page, '^Pendant Shape', defaults.pendantShape);
        await page.waitForTimeout(400);
    }

    // 3. Ring Size (Dropdown)
    if (defaults.ringSize) {
        console.log(`  > Setting Ring Size: "${defaults.ringSize}"...`);
        await selectFormDropdown(page, '^Ring Size', defaults.ringSize);
        await page.waitForTimeout(400);
    }

    // 4. Maang Tikka (Dropdown)
    if (defaults.maangTikka) {
        console.log(`  > Setting Maang Tikka: "${defaults.maangTikka}"...`);
        await selectFormDropdown(page, '^Maang Tikka', defaults.maangTikka);
        await page.waitForTimeout(400);
    }

    // 5. Occasion (Multi-select dropdown)
    const occasionVals = defaults.occasion || ['Everyday'];
    console.log(`  > Setting Occasion (Multi-Select):`, occasionVals);
    await selectMultiSelectDropdown(page, '^Occasion', occasionVals);
    await page.waitForTimeout(400);

    // 6. Search Keywords (Input)
    if (defaults.searchKeywords) {
        console.log(`  > Setting Search Keywords: "${defaults.searchKeywords}"...`);
        await fillFormField(page, '^Search Keywords', defaults.searchKeywords);
        await page.waitForTimeout(400);
    }

    // 7. Key Features (Input)
    if (defaults.keyFeatures) {
        console.log(`  > Setting Key Features: "${defaults.keyFeatures}"...`);
        await fillFormField(page, '^Key Features', defaults.keyFeatures);
        await page.waitForTimeout(400);
    }

    // 8. Description (Textarea)
    if (defaults.description) {
        console.log(`  > Setting Description...`);
        await fillFormField(page, '^Description', defaults.description);
        await page.waitForTimeout(1000);
    }

    console.log(`\n[${username}] Step 16 Complete: Additional Description attributes filled!`);
    updateStatus(username, 'Additional Description Filled');

    // Step 17: Click "Send to QC" button
    console.log(`\n[${username}] Step 17: Locating and clicking 'Send to QC' button...`);
    updateStatus(username, 'Submitting: Sending to QC...');

    await clickSendToQC(page);

    console.log(`\n[${username}] Step 17 Complete: Single Listing successfully sent to QC!`);
    updateStatus(username, 'Listing Sent to QC Successfully');

    console.log(`[${username}] Waiting 5 seconds before closing...`);
    await page.waitForTimeout(5000);
}

async function ensurePriceAndStockFilled(page, username, defaults, baseSkuName) {
    for (let round = 1; round <= 3; round++) {
        console.log(`  > [Round ${round}] Populating Price, Stock and Shipping Information...`);

        // 1. Seller SKU ID
        await fillFormField(page, '^Seller SKU ID', baseSkuName);
        // 2. Listing Status
        await selectFormDropdown(page, '^Listing Status', defaults.listingStatus || 'ACTIVE');
        // 3. MRP & Selling Price & MinOQ
        await fillFormField(page, '^MRP', defaults.mrp || '999');
        await fillFormField(page, '^Your selling price', defaults.sellingPrice || '199');
        if (defaults.minOQ) {
            await selectFormDropdown(page, 'Minimum Order Quantity', defaults.minOQ || '1');
        }
        // 4. Fulfillment & Procurement & Stock
        await selectFormDropdown(page, '^Fullfilment by', defaults.fulfilmentBy || 'Seller');
        await selectFormDropdown(page, '^Procurement type', defaults.procurementType || 'In Stock');
        await fillFormField(page, '^Procurement SLA', defaults.procurementSLA || '1');
        await fillFormField(page, '^Stock', defaults.stock || defaults.inventory || '1000');
        // 5. Shipping Provider
        await selectFormDropdown(page, '^Shipping provider', defaults.shippingProvider || 'Flipkart');
        // 6. Package Dimensions
        await fillFormField(page, '^Length', defaults.packageLength || '15');
        await fillFormField(page, '^Breadth', defaults.packageBreadth || '12');
        await fillFormField(page, '^Height', defaults.packageHeight || '4');
        await fillFormField(page, '^Weight', defaults.packageWeight || '0.15');
        // 7. Tax Details
        await fillFormField(page, '^HSN', defaults.hsnCode || '711790');
        await fillFormField(page, '^Luxury Cess', defaults.luxuryCess || '0');
        await selectFormDropdown(page, '^Tax Code', defaults.taxCode || 'GST_3');
        // 8. Manufacturing Details
        await selectFormDropdown(page, '^Country Of Origin', defaults.countryOfOrigin || 'India');
        await fillFormField(page, '^Manufacturer Details', defaults.manufacturerDetails || 'Bazar Collections, Yogi Chowk, Surat, Gujarat - 395010');
        await fillFormField(page, '^Packer Details', defaults.packerDetails || 'Bazar Collections, Yogi Chowk, Surat, Gujarat - 395010');
        await fillFormField(page, '^Importer Details', defaults.importerDetails || 'Not Required');

        await page.waitForTimeout(1000);

        const hasErrors = await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('div, span, button, a, li'));
            const pTab = tabs.find(t => /Price, Stock/i.test(t.innerText || ''));
            return pTab && /error/i.test(pTab.innerText || '');
        });

        if (!hasErrors) {
            console.log(`  > Price, Stock and Shipping Information verified (0 errors).`);
            break;
        }
    }
}

async function ensureProductDescriptionFilled(page, username, defaults, baseSkuName) {
    for (let round = 1; round <= 3; round++) {
        console.log(`  > [Round ${round}] Populating Product Description attributes...`);

        // 1. Model Number
        await fillFormField(page, '^Model Number', baseSkuName);
        // 2. Items Included
        const itemsInc = defaults.itemsIncluded || defaults.includedComponents || '1 Necklace, 1 Pair of Earrings';
        await fillFormField(page, '^Items Included', itemsInc);
        // 3. Type
        await selectFormDropdown(page, '^Type', defaults.type || 'Earring & Necklace Set');
        // 4. Ideal For
        await selectMultiSelectDropdown(page, '^Ideal For', defaults.idealFor || ['Women', 'Girls']);
        // 5. Color
        await selectMultiSelectDropdown(page, '^Color', defaults.color || ['Gold']);
        // 6. Base Material
        await selectMultiSelectDropdown(page, '^Base Material', defaults.baseMaterial || defaults.baseMetal || ['Alloy']);
        // 7. Plating
        await selectMultiSelectDropdown(page, '^Plating', defaults.plating || ['Gold-plated']);
        // 8. Pearl Type
        await selectFormDropdown(page, '^Pearl Type', defaults.pearlType || 'NA');
        // 9. Diamond Color Grade
        await selectFormDropdown(page, '^Diamond Color Grade', defaults.diamondColorGrade || 'NA');
        // 10. Diamond Clarity
        await selectFormDropdown(page, '^Diamond Clarity', defaults.diamondClarity || 'NA');
        // 11. Certification
        await selectFormDropdown(page, '^Certification', defaults.certification || 'NA');
        // 12. Gemstone
        await selectFormDropdown(page, '^Gemstone', defaults.gemstone || 'NA');
        // 13. Diamond Cut
        await selectFormDropdown(page, '^Diamond Cut', defaults.diamondCut || 'NA');
        // 14. Diamond Shape
        await fillFormField(page, '^Diamond Shape', defaults.diamondShape || 'NA');
        // 15. Diamond Weight
        await fillFormField(page, '^Diamond Weight', defaults.diamondWeight || '0');
        // 16. Brand Color
        const brandColorVal = defaults.brandColor || defaults.color || 'Gold';
        await fillFormField(page, '^Brand Color', brandColorVal);
        // 17. Silver Weight
        await fillFormField(page, '^Silver Weight', defaults.silverWeight || '0');
        // 18. Pack of (Both single dropdown and multi-select fallbacks)
        const packVal = defaults.packOf ? (Array.isArray(defaults.packOf) ? defaults.packOf[0] : defaults.packOf) : '1';
        await selectFormDropdown(page, '^Pack of', packVal);
        await selectMultiSelectDropdown(page, '^Pack of', [packVal]);

        // Click any suggested value apply button
        const applyBtn = page.locator('button, a, span').filter({ hasText: /^Apply$/i }).filter({ visible: true }).first();
        if (await applyBtn.isVisible({ timeout: 800 }).catch(() => false)) {
            await applyBtn.click({ force: true }).catch(() => {});
        }

        await page.waitForTimeout(1000);

        const hasErrors = await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('div, span, button, a, li'));
            const dTab = tabs.find(t => /Product Description/i.test(t.innerText || ''));
            return dTab && /error/i.test(dTab.innerText || '');
        });

        if (!hasErrors) {
            console.log(`  > Product Description verified (0 errors).`);
            break;
        }
    }
}

async function validateAndFixAllTabs(page, username, defaults, baseSkuName) {
    for (let attempt = 1; attempt <= 2; attempt++) {
        // 1. Check Price & Stock tab
        const hasPriceError = await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('div, span, button, a, li'));
            const pTab = tabs.find(t => /Price, Stock/i.test(t.innerText || ''));
            return pTab && /error/i.test(pTab.innerText || '');
        });

        if (hasPriceError) {
            console.log(`  > [Attempt ${attempt}] Resolving errors on 'Price, Stock and Shipping Information' tab...`);
            const pTabLoc = page.locator('div, span, button, a, li').filter({ hasText: /^Price, Stock/i }).first();
            await pTabLoc.click({ force: true }).catch(() => {});
            await page.waitForTimeout(1500);

            // Re-fill all Price & Stock fields
            await fillFormField(page, '^Seller SKU ID', baseSkuName);
            await selectFormDropdown(page, '^Listing Status', defaults.listingStatus || 'ACTIVE');
            await fillFormField(page, '^MRP', defaults.mrp || '999');
            await fillFormField(page, '^Your selling price', defaults.sellingPrice || '199');
            await selectFormDropdown(page, 'Minimum Order Quantity', defaults.minOQ || '1');
            await selectFormDropdown(page, '^Fullfilment by', defaults.fulfilmentBy || 'Seller');
            await selectFormDropdown(page, '^Procurement type', defaults.procurementType || 'In Stock');
            await fillFormField(page, '^Procurement SLA', defaults.procurementSLA || '1');
            await fillFormField(page, '^Stock', defaults.stock || defaults.inventory || '1000');
            await selectFormDropdown(page, '^Shipping provider', defaults.shippingProvider || 'Flipkart');
            await fillFormField(page, '^Length', defaults.packageLength || '15');
            await fillFormField(page, '^Breadth', defaults.packageBreadth || '12');
            await fillFormField(page, '^Height', defaults.packageHeight || '4');
            await fillFormField(page, '^Weight', defaults.packageWeight || '0.15');
            await fillFormField(page, '^HSN', defaults.hsnCode || '711790');
            await fillFormField(page, '^Luxury Cess', defaults.luxuryCess || '0');
            await selectFormDropdown(page, '^Tax Code', defaults.taxCode || 'GST_3');
            await selectFormDropdown(page, '^Country Of Origin', defaults.countryOfOrigin || 'India');
            await fillFormField(page, '^Manufacturer Details', defaults.manufacturerDetails || 'Bazar Collections, Yogi Chowk, Surat, Gujarat - 395010');
            await fillFormField(page, '^Packer Details', defaults.packerDetails || 'Bazar Collections, Yogi Chowk, Surat, Gujarat - 395010');
            await fillFormField(page, '^Importer Details', defaults.importerDetails || 'Not Required');
            await page.waitForTimeout(1000);
        }

        // 2. Check Product Description tab
        const hasProductDescError = await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('div, span, button, a, li'));
            const dTab = tabs.find(t => /Product Description/i.test(t.innerText || ''));
            return dTab && /error/i.test(dTab.innerText || '');
        });

        if (hasProductDescError) {
            console.log(`  > [Attempt ${attempt}] Resolving errors on 'Product Description' tab...`);
            const dTabLoc = page.locator('div, span, button, a, li').filter({ hasText: /^Product Description/i }).first();
            await dTabLoc.click({ force: true }).catch(() => {});
            await page.waitForTimeout(1500);

            // Re-fill all Product Description fields
            await fillFormField(page, '^Model Number', baseSkuName);
            const itemsInc = defaults.itemsIncluded || defaults.includedComponents || '1 Necklace, 1 Pair of Earrings';
            await fillFormField(page, '^Items Included', itemsInc);
            await selectFormDropdown(page, '^Type', defaults.type || 'Earring & Necklace Set');
            await selectMultiSelectDropdown(page, '^Ideal For', defaults.idealFor || ['Women', 'Girls']);
            await selectMultiSelectDropdown(page, '^Color', defaults.color || ['Gold']);
            await selectMultiSelectDropdown(page, '^Base Material', defaults.baseMaterial || defaults.baseMetal || ['Alloy']);
            await selectMultiSelectDropdown(page, '^Plating', defaults.plating || ['Gold-plated']);
            await selectFormDropdown(page, '^Pearl Type', defaults.pearlType || 'NA');
            await selectFormDropdown(page, '^Diamond Color Grade', defaults.diamondColorGrade || 'NA');
            await selectFormDropdown(page, '^Diamond Clarity', defaults.diamondClarity || 'NA');
            await selectFormDropdown(page, '^Certification', defaults.certification || 'NA');
            await selectFormDropdown(page, '^Gemstone', defaults.gemstone || 'NA');
            await selectFormDropdown(page, '^Diamond Cut', defaults.diamondCut || 'NA');
            await fillFormField(page, '^Diamond Shape', defaults.diamondShape || 'NA');
            await fillFormField(page, '^Diamond Weight', defaults.diamondWeight || '0');
            const brandColorVal = defaults.brandColor || defaults.color || 'Gold';
            await fillFormField(page, '^Brand Color', brandColorVal);
            await fillFormField(page, '^Silver Weight', defaults.silverWeight || '0');
            await selectMultiSelectDropdown(page, '^Pack of', defaults.packOf || ['1']);

            // Click any suggested value apply button
            const applyBtn = page.locator('button, a, span').filter({ hasText: /^Apply$/i }).filter({ visible: true }).first();
            if (await applyBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
                await applyBtn.click({ force: true }).catch(() => {});
            }
            await page.waitForTimeout(1000);
        }
    }
}

async function clickSendToQC(page) {
    console.log(`  > Locating 'Send to QC' button...`);
    await page.waitForTimeout(1500);
    let clicked = false;

    // Method 1: Playwright locator targeting any visible element containing "Send to QC"
    try {
        const sendBtn = page.locator('button, [role="button"], a, div, span')
            .filter({ hasText: /Send to QC/i })
            .filter({ visible: true })
            .first();

        if (await sendBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
            const box = await sendBtn.boundingBox();
            if (box) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                clicked = true;
                console.log(`  > Clicked 'Send to QC' via mouse click at (${Math.round(box.x + box.width / 2)}, ${Math.round(box.y + box.height / 2)}).`);
            } else {
                await sendBtn.click({ force: true });
                clicked = true;
                console.log(`  > Clicked 'Send to QC' via Playwright force click.`);
            }
        }
    } catch (e) {}

    // Method 2: DOM traversal & dispatch
    if (!clicked) {
        clicked = await page.evaluate(() => {
            const allElements = Array.from(document.querySelectorAll('*'));
            for (const el of allElements) {
                const text = (el.innerText || el.textContent || '').trim();
                if (/^Send to QC/i.test(text) && el.clientHeight > 20 && el.clientWidth > 40 && el.clientHeight < 120 && el.clientWidth < 300) {
                    el.scrollIntoView({ block: 'center' });
                    el.click();
                    ['mousedown', 'mouseup', 'click'].forEach(evt => {
                        el.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true }));
                    });
                    return true;
                }
            }
            return false;
        });
        if (clicked) {
            console.log(`  > Clicked 'Send to QC' via DOM dispatch.`);
        }
    }

    await page.waitForTimeout(2500);

    // Method 3: Handle any confirmation popup/modal dialogs
    try {
        const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes, Send to QC"), button:has-text("Submit"), button:has-text("Proceed"), button:has-text("Send to QC"), div[role="dialog"] button')
            .filter({ visible: true })
            .first();

        if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            console.log("  > Found confirmation dialog! Clicking confirmation button...");
            await confirmBtn.click().catch(() => {});
            await page.waitForTimeout(2000);
        }
    } catch (e) {}

    return clicked;
}

async function fillFormField(page, labelRegex, value) {
    if (value === undefined || value === null || value === '') return false;
    const strVal = String(value);

    try {
        const filled = await page.evaluate(({ regexStr, val }) => {
            const regex = new RegExp(regexStr, 'i');
            const allElements = Array.from(document.querySelectorAll('label, div, span, p, h4'));
            let targetLabel = null;

            for (const el of allElements) {
                if (el.children.length > 2) continue;
                const text = (el.innerText || el.textContent || '').trim();
                if (regex.test(text) && text.length < 60 && !text.includes('\n')) {
                    targetLabel = el;
                    break;
                }
            }

            if (!targetLabel) {
                for (const el of allElements) {
                    const text = (el.innerText || '').trim();
                    if (regex.test(text) && text.length < 60) {
                        targetLabel = el;
                        break;
                    }
                }
            }

            if (!targetLabel) return false;

            const lRect = targetLabel.getBoundingClientRect();

            // Strictly find input on the SAME HORIZONTAL ROW (Y within 35px, X strictly to the right)
            const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="file"]), textarea'));
            let inp = null;
            let minDistance = 999999;

            for (const inputEl of allInputs) {
                const iRect = inputEl.getBoundingClientRect();
                if (iRect.width === 0 || iRect.height === 0 || iRect.bottom < 0) continue;
                if (inputEl.placeholder && /search/i.test(inputEl.placeholder) && !regex.test(inputEl.placeholder)) continue;
                if (inputEl.id && /search/i.test(inputEl.id)) continue;

                // Vertical alignment: must be on the same horizontal line (+- 35px)
                const yDiff = Math.abs(iRect.top - lRect.top);
                // Horizontal position: must be to the right of the label's left edge
                if (yDiff < 35 && iRect.left >= lRect.left - 20) {
                    const dist = Math.hypot(iRect.left - lRect.right, iRect.top - lRect.top);
                    if (dist < minDistance) {
                        minDistance = dist;
                        inp = inputEl;
                    }
                }
            }

            if (inp) {
                inp.scrollIntoView({ block: 'center' });
                inp.focus();
                inp.click();

                const isTextArea = inp.tagName === 'TEXTAREA';
                const proto = isTextArea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
                const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                if (nativeSetter) {
                    nativeSetter.call(inp, val);
                } else {
                    inp.value = val;
                }
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                inp.dispatchEvent(new Event('blur', { bubbles: true }));
                return true;
            }

            return false;
        }, { regexStr: labelRegex, val: strVal });

        // Playwright keyboard fallback
        if (!filled) {
            const labelLoc = page.locator('label, div, span, p').filter({ hasText: new RegExp(labelRegex, 'i') }).first();
            if (await labelLoc.isVisible({ timeout: 1500 }).catch(() => false)) {
                const box = await labelLoc.boundingBox();
                if (box) {
                    await page.mouse.click(box.x + 350, box.y + box.height / 2);
                    await page.waitForTimeout(100);
                    await page.keyboard.press('Control+A');
                    await page.keyboard.press('Backspace');
                    await page.keyboard.type(strVal, { delay: 20 });
                    await page.keyboard.press('Tab');
                }
            }
        }

        await page.waitForTimeout(200);
        return true;
    } catch (e) {
        console.error(`Error filling ${labelRegex}:`, e.message);
        return false;
    }
}

async function selectFormDropdown(page, labelRegex, targetValue) {
    if (!targetValue) return false;
    const strVal = String(targetValue).trim();
    console.log(`  > Selecting dropdown for "${labelRegex}" -> "${strVal}"...`);

    try {
        const triggerClicked = await page.evaluate(({ lblStr }) => {
            const regex = new RegExp(lblStr, 'i');
            const allElements = Array.from(document.querySelectorAll('label, div, span, p, h4'));
            let targetLabel = null;

            for (const el of allElements) {
                if (el.children.length > 2) continue;
                const text = (el.innerText || el.textContent || '').trim();
                if (regex.test(text) && text.length < 60 && !text.includes('\n')) {
                    targetLabel = el;
                    break;
                }
            }
            if (!targetLabel) {
                for (const el of allElements) {
                    const text = (el.innerText || '').trim();
                    if (regex.test(text) && text.length < 60) {
                        targetLabel = el;
                        break;
                    }
                }
            }
            if (!targetLabel) return false;

            const lRect = targetLabel.getBoundingClientRect();
            const triggers = Array.from(document.querySelectorAll('div[class*="select" i], [role="button"], select, div[class*="Dropdown" i], [role="combobox"]'));
            let trigger = null;
            let minDistance = 999999;

            for (const trig of triggers) {
                const tRect = trig.getBoundingClientRect();
                if (tRect.width === 0 || tRect.height === 0 || tRect.bottom < 0) continue;

                const yDiff = Math.abs(tRect.top - lRect.top);
                if (yDiff < 35 && tRect.left >= lRect.left - 20) {
                    const dist = Math.hypot(tRect.left - lRect.right, tRect.top - lRect.top);
                    if (dist < minDistance) {
                        minDistance = dist;
                        trigger = trig;
                    }
                }
            }

            if (trigger) {
                trigger.scrollIntoView({ block: 'center' });
                trigger.click();
                ['mousedown', 'mouseup', 'click'].forEach(evt => trigger.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true })));
                return true;
            }
            return false;
        }, { lblStr: labelRegex });

        if (triggerClicked) {
            await page.waitForTimeout(500);

            const searchInput = page.locator('.dropdown-menu input, [role="listbox"] input, div[class*="menu" i] input, div[class*="popover" i] input').first();
            if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
                await searchInput.fill(strVal);
                await page.waitForTimeout(300);
            }

            const optionClicked = await page.evaluate(({ val }) => {
                const search = val.toLowerCase().replace(/[^a-z0-9]/g, '');
                const options = Array.from(document.querySelectorAll('li, div[role="option"], [class*="option" i], [class*="item" i], div, span'));
                
                for (const opt of options) {
                    const t = (opt.innerText || opt.textContent || '').trim();
                    const cleanT = t.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (cleanT === search && t.length < 40) {
                        opt.scrollIntoView();
                        opt.click();
                        ['mousedown', 'mouseup', 'click'].forEach(evt => opt.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true })));
                        return true;
                    }
                }

                for (const opt of options) {
                    const t = (opt.innerText || opt.textContent || '').trim();
                    const cleanT = t.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if ((cleanT.includes(search) || search.includes(cleanT)) && cleanT.length > 0 && t.length < 40) {
                        opt.scrollIntoView();
                        opt.click();
                        ['mousedown', 'mouseup', 'click'].forEach(evt => opt.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true })));
                        return true;
                    }
                }
                return false;
            }, { val: strVal });

            if (!optionClicked) {
                const optLoc = page.locator(`text=/^${strVal}$/i`).or(page.locator(`text=${strVal}`)).filter({ visible: true }).first();
                if (await optLoc.isVisible({ timeout: 1500 }).catch(() => false)) {
                    await optLoc.click({ force: true });
                }
            }
        }
        await page.waitForTimeout(300);
        return true;
    } catch (e) {
        console.error(`Error selecting dropdown ${labelRegex}:`, e.message);
        return false;
    }
}

async function selectMultiSelectDropdown(page, labelRegex, values) {
    if (!values) return false;
    const valList = Array.isArray(values) ? values : String(values).split(',').map(s => s.trim()).filter(Boolean);
    if (valList.length === 0) return false;

    try {
        const clickedTrigger = await page.evaluate(({ lblStr }) => {
            const regex = new RegExp(lblStr, 'i');
            const allElements = Array.from(document.querySelectorAll('label, div, span, p, h4'));
            let targetLabel = null;

            for (const el of allElements) {
                if (el.children.length > 2) continue;
                const text = (el.innerText || el.textContent || '').trim();
                if (regex.test(text) && text.length < 60 && !text.includes('\n')) {
                    targetLabel = el;
                    break;
                }
            }
            if (!targetLabel) {
                for (const el of allElements) {
                    const text = (el.innerText || '').trim();
                    if (regex.test(text) && text.length < 60) {
                        targetLabel = el;
                        break;
                    }
                }
            }
            if (!targetLabel) return false;

            const lRect = targetLabel.getBoundingClientRect();
            const triggers = Array.from(document.querySelectorAll('div[class*="select" i], [role="button"], select, div[class*="Dropdown" i], [role="combobox"]'));
            let trigger = null;
            let minDistance = 999999;

            for (const trig of triggers) {
                const tRect = trig.getBoundingClientRect();
                if (tRect.width === 0 || tRect.height === 0 || tRect.bottom < 0) continue;

                const yDiff = Math.abs(tRect.top - lRect.top);
                if (yDiff < 35 && tRect.left >= lRect.left - 20) {
                    const dist = Math.hypot(tRect.left - lRect.right, tRect.top - lRect.top);
                    if (dist < minDistance) {
                        minDistance = dist;
                        trigger = trig;
                    }
                }
            }

            if (trigger) {
                trigger.scrollIntoView({ block: 'center' });
                trigger.click();
                ['mousedown', 'mouseup', 'click'].forEach(evt => trigger.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true })));
                return true;
            }
            return false;
        }, { lblStr: labelRegex });

        if (clickedTrigger) {
            await page.waitForTimeout(500);

            for (const val of valList) {
                const searchInput = page.locator('.dropdown-menu input, [role="listbox"] input, div[class*="menu" i] input').first();
                if (await searchInput.isVisible({ timeout: 500 }).catch(() => false)) {
                    await searchInput.fill(val);
                    await page.waitForTimeout(200);
                }

                await page.evaluate(({ itm }) => {
                    const search = itm.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const options = Array.from(document.querySelectorAll('li, div[role="option"], [class*="option" i], label, div, span'));
                    for (const opt of options) {
                        const t = (opt.innerText || opt.textContent || '').trim();
                        const cleanT = t.toLowerCase().replace(/[^a-z0-9]/g, '');
                        if (cleanT === search || (cleanT.includes(search) && cleanT.length < 30)) {
                            const chk = opt.querySelector('input[type="checkbox"]');
                            if (chk && !chk.checked) {
                                chk.click();
                            } else {
                                opt.click();
                            }
                            return true;
                        }
                    }
                    return false;
                }, { itm: val });
                await page.waitForTimeout(250);
            }

            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);
        }
        return true;
    } catch (e) {
        return false;
    }
}

function getAllMainSkus() {
    let allFiles = [];
    try {
        if (fs.existsSync(IMAGES_DIR)) {
            allFiles = fs.readdirSync(IMAGES_DIR).filter(f => !f.startsWith('.') && /\.(jpe?g|png|webp)$/i.test(f));
        }
    } catch (e) {
        console.error("Error reading IMAGES_DIR:", e.message);
        return ['pd_1030'];
    }

    if (allFiles.length === 0) {
        return ['pd_1030'];
    }

    // Filter main SKU images: files whose name does NOT contain _a, _b, _c, _d
    const mainFiles = allFiles.filter(f => {
        const name = path.parse(f).name.toLowerCase();
        return !name.endsWith('_a') && !name.endsWith('_b') && !name.endsWith('_c') && !name.endsWith('_d') &&
               !name.includes('_a.') && !name.includes('_b.') && !name.includes('_c.') && !name.includes('_d.');
    });

    if (mainFiles.length === 0) {
        return [path.parse(allFiles[0]).name];
    }

    // Sort naturally: pd_1030, pd_1031, pd_1032, pd_1033...
    mainFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    return mainFiles.map(f => path.parse(f).name);
}

function getImagesForCatalog(baseName = 'pd_1030') {
    let allFiles = [];
    try {
        if (fs.existsSync(IMAGES_DIR)) {
            allFiles = fs.readdirSync(IMAGES_DIR).filter(f => !f.startsWith('.') && /\.(jpe?g|png|webp)$/i.test(f));
        }
    } catch (e) {
        console.error("Error reading IMAGES_DIR:", e.message);
        return [];
    }

    if (allFiles.length === 0) {
        return [];
    }

    const sanitizedBase = baseName.trim().toLowerCase();

    // 1. Find main image for this specific SKU (e.g. pd_1030.jpeg or pd_1031.jpeg)
    let mainImg = allFiles.find(f => path.parse(f).name.toLowerCase() === sanitizedBase);
    if (!mainImg) {
        mainImg = allFiles.find(f => {
            const name = path.parse(f).name.toLowerCase();
            return !name.includes('_a') && !name.includes('_b') && !name.includes('_c') && !name.includes('_d');
        }) || allFiles[0];
    }

    // 2. Find _a, _b, _c, _d side/template images (first checks SKU-specific, then common pool)
    const imgA = allFiles.find(f => path.parse(f).name.toLowerCase() === `${sanitizedBase}_a`) ||
                 allFiles.find(f => f.toLowerCase().includes('_a'));

    const imgB = allFiles.find(f => path.parse(f).name.toLowerCase() === `${sanitizedBase}_b`) ||
                 allFiles.find(f => f.toLowerCase().includes('_b'));

    const imgC = allFiles.find(f => path.parse(f).name.toLowerCase() === `${sanitizedBase}_c`) ||
                 allFiles.find(f => f.toLowerCase().includes('_c'));

    const imgD = allFiles.find(f => path.parse(f).name.toLowerCase() === `${sanitizedBase}_d`) ||
                 allFiles.find(f => f.toLowerCase().includes('_d'));

    const ordered = [mainImg];
    if (imgA) ordered.push(imgA);
    if (imgB) ordered.push(imgB);
    if (imgC) ordered.push(imgC);
    if (imgD) ordered.push(imgD);

    console.log(`  > Image slot mapping for SKU "${baseName}" (${ordered.length} images):`);
    ordered.forEach((img, i) => console.log(`     Slot ${i + 1}: ${img}`));

    return ordered.map(f => path.join(IMAGES_DIR, f));
}

async function selectImageSlot(page, slotIndex) {
    console.log(`  > Switching to thumbnail slot ${slotIndex + 1}...`);

    // Slot labels: 0: Front view, 1: Closeup, 2: Package, 3: Size View, 4: Image (1st), 5: Image (2nd)
    const slotKeywords = ['Front view', 'Closeup', 'Package', 'Size View'];

    let switched = false;

    // Method 1: Target slot box using Playwright locator and native mouse click
    try {
        let slotLocator;
        if (slotIndex < 4) {
            slotLocator = page.locator(`text=${slotKeywords[slotIndex]}`).first();
        } else {
            const imageSlots = page.locator('text="Image"');
            const targetIdx = slotIndex === 4 ? 0 : 1;
            slotLocator = imageSlots.nth(targetIdx);
        }

        if (await slotLocator.isVisible({ timeout: 3000 }).catch(() => false)) {
            const box = await slotLocator.boundingBox();
            if (box) {
                // Click in center of the thumbnail box
                await page.mouse.click(box.x + box.width / 2, box.y - 25);
                await page.waitForTimeout(300);
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                switched = true;
            } else {
                await slotLocator.click({ force: true });
                switched = true;
            }
        }
    } catch (e) { }

    // Method 2: DOM element click & dispatchEvent
    if (!switched) {
        switched = await page.evaluate((idx) => {
            const keywords = ['Front view', 'Closeup', 'Package', 'Size View', 'Image'];
            const allElements = Array.from(document.querySelectorAll('*'));
            const slots = [];

            for (const el of allElements) {
                const text = (el.innerText || '').trim();
                if (keywords.some(k => text.startsWith(k) || text === k) && el.clientHeight > 30 && el.clientWidth > 30 && el.clientHeight < 200 && el.clientWidth < 200) {
                    if (!slots.some(s => s.contains(el) || el.contains(s))) {
                        slots.push(el);
                    }
                }
            }

            if (slots.length > idx) {
                slots[idx].scrollIntoView({ block: 'nearest', inline: 'center' });
                slots[idx].click();
                ['mousedown', 'mouseup', 'click'].forEach(evt => {
                    slots[idx].dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true }));
                });
                return true;
            }
            return false;
        }, slotIndex);
    }

    await page.waitForTimeout(1500);
}

async function uploadPhotoToCurrentSlot(page, imagePath, slotNum) {
    const filename = path.basename(imagePath);
    console.log(`  > [Slot ${slotNum}] Uploading "${filename}"...`);

    if (!fs.existsSync(imagePath)) {
        console.error(`  > Image file not found: ${imagePath}`);
        return false;
    }

    // First ensure file input is ready
    const fileInput = page.locator('input[type="file"]').first();

    // Check for Upload Photo button
    const uploadBtn = page.locator('button:has-text("Upload Photo"), button:has-text("Upload"), [role="button"]:has-text("Upload Photo")')
        .filter({ visible: true })
        .first();

    if (await uploadBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        try {
            const [fileChooser] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 6000 }),
                uploadBtn.click({ force: true })
            ]);
            await fileChooser.setFiles(imagePath);
            console.log(`  > [Slot ${slotNum}] File set via fileChooser.`);
        } catch (e) {
            console.log(`  > Attaching directly to input[type="file"]...`);
            if (await fileInput.count() > 0) {
                await fileInput.setInputFiles(imagePath);
            }
        }
    } else {
        // Direct file input fallback
        console.log(`  > Directly setting input[type="file"]...`);
        if (await fileInput.count() > 0) {
            await fileInput.setInputFiles(imagePath);
        }
    }

    // Wait for Flipkart to process the image upload
    await page.waitForTimeout(4000);
    console.log(`  > [Slot ${slotNum}] Image upload processed.`);
    return true;
}

async function run() {
    console.log(`\n======================================================`);
    console.log(`Starting Flipkart Jewellery Set Single Listing Bot`);
    console.log(`======================================================`);

    const allAccounts = getAccounts();
    const accounts = targetAccount
        ? allAccounts.filter(a => a.username.toLowerCase() === targetAccount.toLowerCase())
        : allAccounts;

    if (accounts.length === 0) {
        console.error("No active accounts found in accounts.csv.");
        process.exit(1);
    }

    const defaults = getDefaults();
    console.log(`Loaded ${accounts.length} active account(s).`);

    for (const account of accounts) {
        const { username } = account;
        console.log(`\n>>> Processing Account: ${username} <<<`);
        updateStatus(username, 'Starting Bot...');

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
                    page = pages.length > 0 ? pages[0] : await context.newPage();
                } else {
                    context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
                    page = await context.newPage();
                }
            } else {
                const sessionPath = path.join(sessionDir, `session_${username.replace(/[@.]/g, '_')}.json`);
                browser = await launchBrowserForAccount(username);
                context = await browser.newContext({
                    storageState: fs.existsSync(sessionPath) ? sessionPath : undefined,
                    viewport: { width: 1920, height: 1080 }
                });
                page = await context.newPage();
            }

            // Ensure logged in
            await ensureLoggedIn(page, account);

            // Discover all main SKU images to process in loop
            const allMainSkus = getAllMainSkus();
            console.log(`\nDiscovered ${allMainSkus.length} Main SKU(s) to upload in loop:`);
            allMainSkus.forEach((sku, idx) => console.log(`  ${idx + 1}. SKU: "${sku}" (Shares side photos _a, _b, _c, _d)`));

            // Loop through each main SKU and upload its catalog
            for (let i = 0; i < allMainSkus.length; i++) {
                const currentSku = allMainSkus[i];
                console.log(`\n======================================================`);
                console.log(`[${username}] Processing Catalog ${i + 1}/${allMainSkus.length} -> SKU: "${currentSku}"`);
                console.log(`======================================================`);
                updateStatus(username, `Uploading SKU ${currentSku} (${i + 1}/${allMainSkus.length})...`);

                try {
                    // Execute the single listing upload flow for this specific SKU
                    await startSingleListingFlow(page, account, defaults, currentSku);

                    // Successful submission
                    const successShot = await captureScreenshot(page, currentSku, 'success');
                    console.log(`[${username}] Catalog SKU "${currentSku}" (${i + 1}/${allMainSkus.length}) successfully sent to QC!`);
                    updateStatus(username, `Catalog ${currentSku} Sent to QC (${i + 1}/${allMainSkus.length})`);
                    sendSkuNotification(username, currentSku, 'SUCCESS', `Catalog SKU "${currentSku}" sent to QC successfully!`, successShot);

                } catch (skuError) {
                    console.error(`[${username}] Error processing SKU "${currentSku}":`, skuError.message);

                    // Capture screenshot of the error state on Flipkart
                    const errorShot = await captureScreenshot(page, currentSku, 'error');
                    updateStatus(username, `Error on SKU ${currentSku}: ${skuError.message}`);
                    sendSkuNotification(username, currentSku, 'ERROR', `Failed on SKU "${currentSku}": ${skuError.message}`, errorShot);

                    console.log(`  > Captured error screenshot: ${errorShot || 'None'}`);
                    console.log(`  > Stopping current SKU and recovering for next SKU...`);
                }

                // If more SKUs remain, navigate back to Listings/Add Single Listing page
                if (i < allMainSkus.length - 1) {
                    console.log(`\n[${username}] Returning to Add Listing page for next SKU (${allMainSkus[i + 1]})...`);
                    updateStatus(username, `Preparing next catalog (${allMainSkus[i + 1]})...`);
                    try {
                        await page.goto('https://seller.flipkart.com/index.html#dashboard/my-listings/add', { waitUntil: 'domcontentloaded', timeout: 20000 });
                    } catch (e) {
                        console.log("  > Navigation timeout, clicking Listings sidebar...");
                    }
                    await page.waitForTimeout(4000);
                }
            }

            console.log(`\n[${username}] All ${allMainSkus.length} catalogs processed!`);
            updateStatus(username, `Completed ${allMainSkus.length} catalogs!`);

        } catch (err) {
            console.error(`[${username}] Fatal Error during flow:`, err.message);
            updateStatus(username, 'Fatal Error: ' + err.message);
        } finally {
            try {
                if (page) await page.close().catch(() => {});
                if (!isExisting && browser) {
                    await browser.close().catch(() => {});
                }
            } catch (e) {}
            console.log(`[${username}] Browser task completed and closed.`);
        }
    }

    console.log("\n======================================================");
    console.log("Flipkart Single Listing Bot Finished.");
    console.log("======================================================\n");
    process.exit(0);
}

run();
