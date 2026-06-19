const playwrightModule = process.env.PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(playwrightModule);

const baseUrl = process.env.GATEPASS_FRONTEND_URL || "http://127.0.0.1:5500/";
const username = process.env.GATEPASS_TEST_USERNAME;
const password = process.env.GATEPASS_TEST_PASSWORD;

if (!username || !password) {
    throw new Error(
        "Set GATEPASS_TEST_USERNAME and GATEPASS_TEST_PASSWORD before running.",
    );
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];

page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
page.on("console", (message) => {
    if (message.type() === "error") {
        errors.push(`console: ${message.text()}`);
    }
});

try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.locator("#empId").fill(username);
    await page.locator("#empPass").fill(password);
    await page.locator('#loginForm button[type="submit"]').click();
    await page.locator("#appView").waitFor({ state: "visible" });

    const userName = await page.locator("#navUserName").innerText();
    const userRole = await page.locator("#navUserRole").innerText();
    const scannerVisible = await page.locator("#navGroupSecurity").isVisible();

    if (scannerVisible) {
        await page.locator('[data-target="guardScan"]').click();
        await page.locator("#qrCameraSelect").waitFor({ state: "visible" });
    }

    const result = {
        userName,
        userRole,
        scannerVisible,
        mediaDevices: await page.evaluate(
            () => Boolean(navigator.mediaDevices?.getUserMedia),
        ),
        barcodeDetector: await page.evaluate(
            () => "BarcodeDetector" in window,
        ),
        errors,
    };

    console.log(JSON.stringify(result, null, 2));
    if (errors.length) process.exitCode = 1;
} finally {
    await browser.close();
}
