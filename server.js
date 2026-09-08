const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const { getPortForAccount } = require('./browser_manager');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Map of currently running processes
const activeProcesses = new Map();

const getSingleCatalogImagesPath = () => {
    const dir = path.join(__dirname, 'single_catalog_images');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
};

const singleCatalogStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, getSingleCatalogImagesPath());
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});
const uploadSingleCatalogImage = multer({ storage: singleCatalogStorage });

app.use('/single_catalog_images', express.static(getSingleCatalogImagesPath()));

const getScreenshotsPath = () => {
    const dir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
};
app.use('/screenshots', express.static(getScreenshotsPath()));

const getNotificationsPath = () => path.join(__dirname, 'catalog_notifications.json');
let catalogNotifications = [];
try {
    if (fs.existsSync(getNotificationsPath())) {
        catalogNotifications = JSON.parse(fs.readFileSync(getNotificationsPath(), 'utf8'));
    }
} catch (e) {
    catalogNotifications = [];
}

const saveNotifications = () => {
    try {
        fs.writeFileSync(getNotificationsPath(), JSON.stringify(catalogNotifications.slice(-100), null, 2), 'utf8');
    } catch (e) {}
};

app.get('/api/catalog-notifications', (req, res) => {
    res.json(catalogNotifications);
});

app.delete('/api/catalog-notifications', (req, res) => {
    catalogNotifications = [];
    saveNotifications();
    res.json({ success: true });
});

const getAccountsPath = () => path.join(__dirname, 'accounts.csv');
const getOtpStatusPath = () => path.join(__dirname, 'login_otp_status.json');

app.get('/api/accounts', (req, res) => {
    try {
        if (!fs.existsSync(getAccountsPath())) {
            return res.json([]);
        }
        const csv = fs.readFileSync(getAccountsPath(), 'utf8');
        const lines = csv.split('\n').filter(l => l.trim().length > 0);

        let accounts = [];
        for (let line of lines) {
            if (line.startsWith('username,')) continue; // skip header
            const parts = line.split(',');
            if (parts.length >= 2) {
                const username = parts[0].trim();
                const password = parts[1].trim();
                const name = parts[2] ? parts[2].trim() : '';
                const isActive = parts[3] ? parts[3].trim() === 'true' : true;
                const brand = parts[4] ? parts[4].trim() : (name || '');
                accounts.push({ username, password, name, isActive, brand });
            }
        }
        res.json(accounts);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/accounts', (req, res) => {
    try {
        const { accounts } = req.body;
        if (!Array.isArray(accounts)) {
            return res.status(400).json({ error: 'Accounts should be an array' });
        }

        let csvContent = 'username,password,name,isActive,brand\n';
        for (let acc of accounts) {
            csvContent += `${acc.username},${acc.password},${acc.name || ''},${acc.isActive !== false},${acc.brand || acc.name || ''}\n`;
        }

        fs.writeFileSync(getAccountsPath(), csvContent, 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- LOGIN OTP ENDPOINTS ---
app.get('/api/otp-status', (req, res) => {
    try {
        const filepath = getOtpStatusPath();
        if (fs.existsSync(filepath)) {
            const data = fs.readFileSync(filepath, 'utf8');
            return res.json(JSON.parse(data));
        }
        res.json({});
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/submit-otp', (req, res) => {
    try {
        const { username, otp } = req.body;
        if (!username || !otp) {
            return res.status(400).json({ error: 'Username and OTP are required' });
        }
        fs.writeFileSync(getOtpStatusPath(), JSON.stringify({ username, status: 'OTP_RECEIVED', otp, timestamp: Date.now() }, null, 2));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/clear-otp', (req, res) => {
    try {
        fs.writeFileSync(getOtpStatusPath(), JSON.stringify({}));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/accounts/login-status', (req, res) => {
    try {
        const filepath = path.join(__dirname, 'accounts_login_status.json');
        if (fs.existsSync(filepath)) {
            const data = fs.readFileSync(filepath, 'utf8');
            return res.json(JSON.parse(data));
        }
        res.json({});
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// --- INVENTORY STOCK UPDATES ENDPOINTS ---
const getInventoryStockUpdatesPath = () => path.join(__dirname, 'inventory_stock_updates.csv');

app.get('/api/inventory-stock-updates', (req, res) => {
    try {
        let updates = [];
        const updatesPath = getInventoryStockUpdatesPath();
        if (fs.existsSync(updatesPath)) {
            const csvText = fs.readFileSync(updatesPath, 'utf8');
            const lines = csvText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('sku,'));
            for (let line of lines) {
                const parts = line.split(',');
                if (parts.length >= 2) {
                    updates.push({ sku: parts[0], stock: parts[1] });
                }
            }
        }
        res.json(updates);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/inventory-stock-updates', (req, res) => {
    try {
        const { updates } = req.body;
        if (!Array.isArray(updates)) {
            return res.status(400).json({ error: 'Updates should be an array' });
        }

        let csvContent = 'sku,stock\n';
        for (let update of updates) {
            csvContent += `${update.sku},${update.stock}\n`;
        }

        fs.writeFileSync(getInventoryStockUpdatesPath(), csvContent, 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- SINGLE CATALOG DEFAULTS & IMAGES ENDPOINTS ---
const getSingleCatalogDefaultsPath = (category = 'jewellery_set') => {
    return path.join(__dirname, 'single_catalog_jewellery_set_defaults.json');
};

app.get('/api/single-catalog-defaults', (req, res) => {
    try {
        const filePath = getSingleCatalogDefaultsPath(req.query.category);
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return res.json(JSON.parse(data));
        }
        res.json({});
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/single-catalog-defaults', (req, res) => {
    try {
        const filePath = getSingleCatalogDefaultsPath(req.query.category);
        fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true, message: 'Defaults saved successfully' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/single-catalog-images', (req, res) => {
    try {
        const dir = getSingleCatalogImagesPath();
        const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
        const fileDetails = files.map(filename => {
            const stats = fs.statSync(path.join(dir, filename));
            return {
                name: filename,
                size: stats.size,
                mtime: stats.mtime,
                url: `/single_catalog_images/${encodeURIComponent(filename)}`
            };
        });
        res.json(fileDetails);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/single-catalog-images', uploadSingleCatalogImage.array('files'), (req, res) => {
    try {
        res.json({ success: true, message: 'Images uploaded successfully', files: req.files });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/single-catalog-images/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const sanitized = path.basename(filename);
        const filepath = path.join(getSingleCatalogImagesPath(), sanitized);
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            res.json({ success: true, message: 'Image deleted' });
        } else {
            res.status(404).json({ error: 'Image not found' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/single-catalog-images', (req, res) => {
    try {
        const dir = getSingleCatalogImagesPath();
        const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
        for (const file of files) {
            fs.unlinkSync(path.join(dir, file));
        }
        res.json({ success: true, message: 'All images deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- SCRIPT RUNNER ENDPOINTS ---
const ALLOWED_SCRIPTS = [
    'flipkart_login_helper.js',
    'flipkart_inventory_stock_update.js',
    'flipkart_jewellery_set_single_catalog_upload.js'
];

app.post('/api/run/:scriptName', (req, res) => {
    const { scriptName } = req.params;
    const { account } = req.body || {};

    if (!ALLOWED_SCRIPTS.includes(scriptName)) {
        return res.status(400).json({ error: 'Invalid script name' });
    }

    const scriptPath = path.join(__dirname, scriptName);
    if (!fs.existsSync(scriptPath)) {
        return res.status(404).json({ error: 'Script not found' });
    }

    const processKey = account ? `${scriptName}:${account}` : scriptName;
    if (activeProcesses.has(processKey)) {
        return res.status(400).json({ error: 'Script is already running for this account' });
    }

    try {
        const env = Object.assign({}, process.env);
        if (account) {
            env.TARGET_ACCOUNT = account;
        }

        const startTime = Date.now();

        // Write status "Checking..." immediately if running login helper
        if (scriptName === 'flipkart_login_helper.js' && account) {
            const statusPath = path.join(__dirname, 'accounts_login_status.json');
            let statuses = {};
            if (fs.existsSync(statusPath)) {
                try { statuses = JSON.parse(fs.readFileSync(statusPath, 'utf8')); } catch (e) { }
            }
            statuses[account] = {
                status: 'Checking...',
                timestamp: Date.now()
            };
            fs.writeFileSync(statusPath, JSON.stringify(statuses, null, 2), 'utf8');
            io.emit('loginStatusUpdate', { account, status: 'Checking...' });
        }

        const child = spawn(process.execPath, ['-r', './screencast_helper.js', scriptName], {
            cwd: __dirname,
            env,
            stdio: ['pipe', 'pipe', 'pipe', 'ipc']
        });
        activeProcesses.set(processKey, { child, startTime });

        child.on('message', (message) => {
            if (message && message.type === 'screencast') {
                io.emit('screencast', {
                    script: scriptName,
                    image: message.image,
                    url: message.url,
                    account
                });
            }
        });

        child.stdout.on('data', (data) => {
            const msg = data.toString();
            console.log(`[${scriptName}] ${msg.trim()}`);
            io.emit('log', { script: scriptName, type: 'info', message: msg });

            // Check for login status update output
            if (msg.includes('STATUS_UPDATE:')) {
                const parts = msg.split('STATUS_UPDATE:')[1].trim().split(':');
                if (parts.length >= 2) {
                    const accountName = parts[0];
                    const accountStatus = parts[1];
                    io.emit('loginStatusUpdate', { account: accountName, status: accountStatus });
                }
            }

            // Check for SKU catalog execution notification
            if (msg.includes('SKU_NOTIFICATION:')) {
                try {
                    const jsonStr = msg.split('SKU_NOTIFICATION:')[1].trim();
                    const notifData = JSON.parse(jsonStr);
                    catalogNotifications.unshift(notifData);
                    if (catalogNotifications.length > 100) catalogNotifications.pop();
                    saveNotifications();
                    io.emit('skuNotification', notifData);
                } catch (e) {
                    console.error("Error parsing SKU_NOTIFICATION:", e.message);
                }
            }
        });

        child.stderr.on('data', (data) => {
            const msg = data.toString();
            console.error(`[${scriptName} ERROR] ${msg.trim()}`);
            io.emit('log', { script: scriptName, type: 'error', message: msg });
        });

        child.on('close', (code) => {
            console.log(`[${scriptName}] Exited with code ${code}`);
            io.emit('log', { script: scriptName, type: 'system', message: `Process exited with code ${code}` });
            activeProcesses.delete(processKey);
            io.emit('processStatus', { script: scriptName, status: 'stopped', account });
            io.emit('screencast_stopped', { script: scriptName });
        });

        io.emit('processStatus', {
            script: scriptName,
            status: 'running',
            startTime,
            account
        });
        res.json({ success: true, message: 'Script started' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/stop/:scriptName', (req, res) => {
    const { scriptName } = req.params;
    const { account } = req.body || {};

    const processKey = account ? `${scriptName}:${account}` : scriptName;
    if (activeProcesses.has(processKey)) {
        const proc = activeProcesses.get(processKey);
        proc.child.kill('SIGTERM');
        activeProcesses.delete(processKey);
        io.emit('log', { script: scriptName, type: 'system', message: `Process killed by user${account ? ` for ${account}` : ''}` });
        io.emit('processStatus', { script: scriptName, status: 'stopped', account });
        return res.json({ success: true, message: 'Script stopped' });
    }

    res.status(404).json({ error: 'Script is not running' });
});

io.on('connection', (socket) => {
    console.log('Socket client connected:', socket.id);

    let activeSessions = new Map(); // Map of account -> { browser, client, page }

    const attachToBrowser = async (account) => {
        const port = getPortForAccount(account);
        const { chromium } = require('playwright-extra');

        try {
            const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
            const contexts = browser.contexts();
            if (contexts.length > 0) {
                const context = contexts[0];
                const pages = context.pages();
                if (pages.length > 0) {
                    const page = pages[0];
                    const client = await context.newCDPSession(page);

                    await client.send('Page.startScreencast', { format: 'jpeg', quality: 75, everyNthFrame: 1 });

                    client.on('Page.screencastFrame', (frame) => {
                        socket.emit('live_frame', { account, data: frame.data });
                        client.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => { });
                    });

                    activeSessions.set(account, { browser, client, page });
                    socket.emit('live_status', { account, status: 'active', port });
                    return true;
                }
            }
        } catch (err) {
            // Browser not running or port not ready
            socket.emit('live_status', { account, status: 'offline', port });
            return false;
        }
    };

    socket.on('start_live_view', async ({ account }) => {
        if (!account) return;
        await attachToBrowser(account);
    });

    socket.on('launch_browser', async ({ account }) => {
        if (!account) return;
        console.log(`[Socket] Manual launch requested for ${account}`);
        try {
            const { launchBrowserForAccount } = require('./browser_manager');
            const sessionPath = path.join(__dirname, 'sessions', `session_${account.replace(/[@.]/g, '_')}.json`);
            const browser = await launchBrowserForAccount(account);
            const context = await browser.newContext({
                storageState: fs.existsSync(sessionPath) ? sessionPath : undefined,
                viewport: { width: 1280, height: 800 }
            });
            const page = await context.newPage();
            await page.goto('https://seller.flipkart.com/index.html#dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { });
            await attachToBrowser(account);
        } catch (e) {
            console.error(`Failed to launch browser for ${account}:`, e.message);
            socket.emit('live_status', { account, status: 'error', message: e.message });
        }
    });

    socket.on('browser_click', async ({ account, x, y }) => {
        const session = activeSessions.get(account);
        if (session && session.client) {
            try {
                await session.client.send('Input.dispatchMouseEvent', {
                    type: 'mousePressed',
                    x: Math.round(x),
                    y: Math.round(y),
                    button: 'left',
                    clickCount: 1
                });
                await session.client.send('Input.dispatchMouseEvent', {
                    type: 'mouseReleased',
                    x: Math.round(x),
                    y: Math.round(y),
                    button: 'left',
                    clickCount: 1
                });
            } catch (e) { }
        }
    });

    socket.on('browser_type', async ({ account, text }) => {
        const session = activeSessions.get(account);
        if (session && session.client) {
            try {
                await session.client.send('Input.insertText', { text });
            } catch (e) { }
        }
    });

    socket.on('browser_key', async ({ account, key, code, keyCode }) => {
        const session = activeSessions.get(account);
        if (session && session.client) {
            try {
                await session.client.send('Input.dispatchKeyEvent', {
                    type: 'rawKeyDown',
                    key,
                    code,
                    windowsVirtualKeyCode: keyCode
                });
                await session.client.send('Input.dispatchKeyEvent', {
                    type: 'keyUp',
                    key,
                    code,
                    windowsVirtualKeyCode: keyCode
                });
            } catch (e) { }
        }
    });

    socket.on('browser_reload', async ({ account }) => {
        const session = activeSessions.get(account);
        if (session && session.client) {
            try {
                await session.client.send('Page.reload');
            } catch (e) { }
        }
    });

    socket.on('browser_navigate', async ({ account, url }) => {
        const session = activeSessions.get(account);
        if (session && session.client) {
            try {
                await session.client.send('Page.navigate', { url });
            } catch (e) { }
        }
    });

    socket.on('stop_live_view', async ({ account }) => {
        const session = activeSessions.get(account);
        if (session) {
            try {
                await session.client.send('Page.stopScreencast').catch(() => { });
                await session.browser.disconnect().catch(() => { });
            } catch (e) { }
            activeSessions.delete(account);
            socket.emit('live_status', { account, status: 'offline' });
        }
    });

    socket.on('disconnect', async () => {
        console.log('Socket client disconnected:', socket.id);
        for (const [account, session] of activeSessions.entries()) {
            try {
                await session.client.send('Page.stopScreencast').catch(() => { });
                await session.browser.disconnect().catch(() => { });
            } catch (e) { }
        }
        activeSessions.clear();
    });
});

const PORT = 3002;
server.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
