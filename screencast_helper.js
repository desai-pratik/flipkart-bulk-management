const { chromium } = require('playwright-extra');

// Monkey patch chromium to automatically capture screencasts from any launched browser
function hookPage(page) {
    if (!page || page._screencastHooked) return;
    page._screencastHooked = true;

    // Attach CDP session once page is ready
    (async () => {
        try {
            const context = page.context();
            const client = await context.newCDPSession(page);
            await client.send('Page.startScreencast', {
                format: 'jpeg',
                quality: 65,
                everyNthFrame: 1
            });

            client.on('Page.screencastFrame', (frame) => {
                if (process.send) {
                    try {
                        process.send({
                            type: 'screencast',
                            image: frame.data,
                            url: page.url()
                        });
                    } catch (e) { }
                }
                client.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => { });
            });
        } catch (e) {
            // CDP screencast error
        }
    })();
}

function hookContext(context) {
    if (!context || context._screencastHooked) return;
    context._screencastHooked = true;

    context.pages().forEach(hookPage);
    context.on('page', hookPage);

    const origNewPage = context.newPage.bind(context);
    context.newPage = async (...args) => {
        const page = await origNewPage(...args);
        hookPage(page);
        return page;
    };
}

function hookBrowser(browser) {
    if (!browser || browser._screencastHooked) return;
    browser._screencastHooked = true;

    browser.contexts().forEach(hookContext);
    browser.on('context', hookContext);

    const origNewContext = browser.newContext.bind(browser);
    browser.newContext = async (...args) => {
        const context = await origNewContext(...args);
        hookContext(context);
        return context;
    };

    const origNewPage = browser.newPage ? browser.newPage.bind(browser) : null;
    if (origNewPage) {
        browser.newPage = async (...args) => {
            const page = await origNewPage(...args);
            hookPage(page);
            return page;
        };
    }
}

// Hook chromium methods
const origLaunch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
    const browser = await origLaunch(...args);
    hookBrowser(browser);
    return browser;
};

const origConnectOverCDP = chromium.connectOverCDP.bind(chromium);
chromium.connectOverCDP = async (...args) => {
    const browser = await origConnectOverCDP(...args);
    hookBrowser(browser);
    return browser;
};

if (chromium.launchPersistentContext) {
    const origLaunchPersistent = chromium.launchPersistentContext.bind(chromium);
    chromium.launchPersistentContext = async (...args) => {
        const context = await origLaunchPersistent(...args);
        hookContext(context);
        return context;
    };
}

module.exports = { hookPage, hookContext, hookBrowser };
