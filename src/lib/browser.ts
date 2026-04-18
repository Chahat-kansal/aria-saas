import { chromium, Browser, BrowserContext, Page } from 'playwright';

type Session = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

const sessions = new Map<string, Session>();

function randomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function browserOpen(url: string): Promise<{
  sessionId: string;
  url: string;
  title: string;
}> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const sessionId = randomId();
  sessions.set(sessionId, { browser, context, page });

  return {
    sessionId,
    url: page.url(),
    title: await page.title(),
  };
}

function getSession(sessionId: string): Session {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Browser session not found: ${sessionId}`);
  return session;
}

export async function browserClick(sessionId: string, selector: string) {
  const { page } = getSession(sessionId);
  await page.locator(selector).first().click({ timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
  return {
    url: page.url(),
    title: await page.title(),
  };
}

export async function browserType(sessionId: string, selector: string, text: string) {
  const { page } = getSession(sessionId);
  const locator = page.locator(selector).first();
  await locator.fill('');
  await locator.type(text, { delay: 15 });
  return { ok: true };
}

export async function browserPress(sessionId: string, selector: string, key: string) {
  const { page } = getSession(sessionId);
  await page.locator(selector).first().press(key);
  await page.waitForLoadState('domcontentloaded');
  return {
    url: page.url(),
    title: await page.title(),
  };
}

export async function browserWait(sessionId: string, ms = 2000) {
  const { page } = getSession(sessionId);
  await page.waitForTimeout(ms);
  return {
    url: page.url(),
    title: await page.title(),
  };
}

export async function browserGetText(sessionId: string, selector?: string) {
  const { page } = getSession(sessionId);

  const text = selector
    ? await page.locator(selector).first().innerText({ timeout: 10000 })
    : await page.locator('body').innerText({ timeout: 10000 });

  return {
    url: page.url(),
    title: await page.title(),
    text: text.slice(0, 20000),
  };
}

export async function browserScreenshot(sessionId: string) {
  const { page } = getSession(sessionId);
  const buffer = await page.screenshot({ fullPage: true, type: 'png' });
  return {
    url: page.url(),
    title: await page.title(),
    screenshotBase64: buffer.toString('base64'),
  };
}

export async function browserEvaluate(sessionId: string, expression: string) {
  const { page } = getSession(sessionId);

  const result = await page.evaluate((expr) => {
    // Keep this limited to simple expression-style usage
    // eslint-disable-next-line no-eval
    return eval(expr);
  }, expression);

  return {
    url: page.url(),
    title: await page.title(),
    result,
  };
}

export async function browserClose(sessionId: string) {
  const session = getSession(sessionId);
  await session.page.close().catch(() => {});
  await session.context.close().catch(() => {});
  await session.browser.close().catch(() => {});
  sessions.delete(sessionId);
  return { ok: true };
}

export async function browserCheckWebsite(url: string) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  const errors: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  page.on('pageerror', (err) => {
    errors.push(err.message);
  });

  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText || 'failed'}`);
  });

  const response = await page.goto(url, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });

  const title = await page.title();
  const bodyText = await page.locator('body').innerText().catch(() => '');

  const screenshot = await page.screenshot({ fullPage: true, type: 'png' });

  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});

  return {
    url,
    finalUrl: response?.url() || url,
    status: response?.status() || null,
    ok: response?.ok() || false,
    title,
    bodyPreview: bodyText.slice(0, 3000),
    consoleErrors: errors.slice(0, 30),
    failedRequests: failedRequests.slice(0, 30),
    screenshotBase64: screenshot.toString('base64'),
  };
}
