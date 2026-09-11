import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';

const fixture = (name: string) => path.resolve('tests/fixtures', name);
const evidence = path.resolve('output/playwright');
mkdirSync(evidence, { recursive: true });
const choose = (page: Page) => page.getByRole('button', { name: 'Choose WebP files', exact: true });
const rows = (page: Page) => page.getByTestId('file-row');
async function open(page: Page) { await page.goto('/'); await expect(choose(page)).toBeEnabled(); }
async function add(page: Page, names: string[]) { await page.getByLabel('Choose WebP files', { exact: true }).setInputFiles(names.map(fixture)); }
async function run(page: Page, count: number) { await expect(page.locator('.status-success')).toHaveCount(count); await expect(page.getByRole('button', { name: 'Download all (.zip)' })).toBeEnabled(); }
async function download(page: Page, buttonName: string, destination: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  const item = await pending;
  await item.saveAs(path.join(evidence, destination));
  return { bytes: readFileSync(path.join(evidence, destination)), name: item.suggestedFilename() };
}
async function inspectPng(page: Page, bytes: Uint8Array) {
  expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return page.evaluate(async data => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const result = { width: bitmap.width, height: bitmap.height, cornerAlpha: ctx.getImageData(0, 0, 1, 1).data[3], centerAlpha: ctx.getImageData(160, 120, 1, 1).data[3] };
    bitmap.close(); canvas.width = canvas.height = 0;
    return result;
  }, Array.from(bytes));
}

test('real lossy, lossless and transparent PNG downloads, exact dimensions and alpha', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await open(page);
  await page.screenshot({ path: path.join(evidence, 'desktop-1440-empty.png') });
  await add(page, ['lossy.webp', 'lossless.webp', 'transparent.webp']);
  await run(page, 3);
  const measurements = [];
  for (const name of ['lossy', 'lossless', 'transparent']) {
    const result = await download(page, `Download ${name}.png`, `${name}.png`);
    expect(result.name).toBe(`${name}.png`);
    const pixels = await inspectPng(page, result.bytes);
    expect([pixels.width, pixels.height]).toEqual(name === 'transparent' ? [320, 240] : [640, 400]);
    if (name === 'transparent') { expect(pixels.cornerAlpha).toBe(0); expect(pixels.centerAlpha).toBe(128); }
    measurements.push({ name, width: pixels.width, height: pixels.height, inputBytes: readFileSync(fixture(`${name}.webp`)).length, outputBytes: result.bytes.length });
  }
  await page.screenshot({ path: path.join(evidence, 'desktop-1440-results.png') });
  await page.screenshot({ path: path.join(evidence, 'desktop-1440-full.png'), fullPage: true });
  writeFileSync(path.join(evidence, 'measurements.json'), JSON.stringify({ browser: `Chromium ${browser.version()}`, measurements }, null, 2) + '\n');
  expect(errors).toEqual([]);
});

test('bulk input, duplicate-safe single names, and real ZIP contents', async ({ page }) => {
  await open(page);
  await page.getByLabel('Choose WebP files', { exact: true }).setInputFiles([
    { name: 'same.webp', mimeType: 'image/webp', buffer: readFileSync(fixture('lossy.webp')) },
    { name: 'same.webp', mimeType: 'application/octet-stream', buffer: readFileSync(fixture('transparent.webp')) },
  ]);
  await run(page, 2);
  const single = await download(page, 'Download same (2).png', 'duplicate-single.png');
  expect(single.name).toBe('same (2).png');
  const zip = await download(page, 'Download all (.zip)', 'duplicates.zip');
  const contents = unzipSync(zip.bytes);
  expect(Object.keys(contents)).toEqual(['same.png', 'same (2).png']);
  expect(await inspectPng(page, contents['same.png'])).toMatchObject({ width: 640, height: 400 });
  expect(await inspectPng(page, contents['same (2).png'])).toMatchObject({ width: 320, height: 240, cornerAlpha: 0 });
});

test('overflow keeps the first ten files, names the rest and frees slots after removal', async ({ page }) => {
  await open(page);
  const buffer = readFileSync(fixture('transparent.webp'));
  await page.getByLabel('Choose WebP files', { exact: true }).setInputFiles(Array.from({ length: 12 }, (_, i) => ({ name: `image-${i}.webp`, mimeType: 'image/webp', buffer })));
  await run(page, 10);
  await expect(rows(page)).toHaveCount(10);
  await expect(choose(page)).toBeDisabled();
  await expect(page.locator('.skipped-files')).toContainText('2 files were not added');
  await page.getByText('See files not added', { exact: true }).click();
  await expect(page.locator('.skipped-files li')).toHaveText(['image-10.webp', 'image-11.webp']);
  await page.getByRole('button', { name: 'Remove completed', exact: true }).click();
  await expect(rows(page)).toHaveCount(0);
  await expect(choose(page)).toBeEnabled();
  await add(page, ['transparent.webp']);
  await run(page, 1);
  await expect(page.locator('.skipped-files')).toHaveCount(0);
});

test('native preview supports keyboard close, downloads and focus restoration; removal keeps failed rows', async ({ page }) => {
  await open(page);
  await add(page, ['transparent.webp', 'disguised.webp']);
  await run(page, 1);
  const thumbnail = page.getByRole('button', { name: 'Preview transparent.png', exact: true });
  await thumbnail.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'transparent.png', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('img')).toBeVisible();
  await expect(dialog).toContainText('320 × 240');
  await page.screenshot({ path: path.join(evidence, 'preview-desktop.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(thumbnail).toBeFocused();
  await thumbnail.click();
  const result = await download(page, 'Save preview PNG', 'preview.png');
  expect(result.name).toBe('transparent.png');
  await dialog.getByRole('button', { name: 'Close preview' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Remove completed', exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('disguised.webp');
});

test('mixed invalid, disguised, animated and truncated inputs cannot stop a valid image', async ({ page }) => {
  await open(page);
  await add(page, ['lossy.webp', 'disguised.webp', 'animated.webp', 'truncated.webp', 'empty.webp']);
  await expect(page.locator('.status-error')).toHaveCount(4);
  await expect(page.getByText('Animated WebP is not supported.', { exact: false }).first()).toBeVisible();
  await run(page, 1);
  await expect(page.locator('.status-error')).toHaveCount(4);
  await page.screenshot({ path: path.join(evidence, 'mixed-inputs.png'), fullPage: true });
});

test('real corrupt payload fails decoding; wholly invalid queues cannot convert', async ({ page }) => {
  await open(page);
  await add(page, ['damaged.webp']);
  await expect(page.locator('.status-error')).toHaveCount(1);
  await expect(page.getByText('Your browser could not decode this WebP.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry damaged.webp' })).toBeEnabled();
  await page.getByRole('button', { name: 'Clear all' }).click();
  await add(page, ['disguised.webp', 'animated.webp']);
  await expect(page.locator('.status-error')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Download all (.zip)' })).toBeDisabled();
  await page.screenshot({ path: path.join(evidence, 'all-failed.png') });
});

test('byte and pixel caps reject before image decoding', async ({ page }) => {
  await page.addInitScript(() => { window.createImageBitmap = () => { throw Error('Decoder must not be reached for oversized images'); }; });
  await open(page);
  await page.getByLabel('Choose WebP files', { exact: true }).setInputFiles([{ name: 'large.webp', mimeType: 'image/webp', buffer: Buffer.alloc(10_000_001) }]);
  await expect(page.locator('.file-error')).toContainText('10 MB');
  await add(page, ['over-pixels.webp']);
  await expect(page.locator('.status-error')).toHaveCount(2);
  await expect(page.getByText('This image exceeds the 20 megapixel limit.', { exact: false })).toBeVisible();
});

test('drag-and-drop accepts a WebP regardless of misleading extension or MIME', async ({ page }) => {
  await open(page);
  const transfer = await page.evaluateHandle(data => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(data)], 'real-image.bin', { type: 'application/octet-stream' }));
    return transfer;
  }, Array.from(readFileSync(fixture('lossless.webp'))));
  await page.locator('.dropzone').dispatchEvent('dragenter', { dataTransfer: transfer });
  await expect(page.locator('.dropzone')).toHaveClass(/is-dragging/);
  await page.locator('.dropzone').dispatchEvent('drop', { dataTransfer: transfer });
  await run(page, 1);
  await expect(page.getByRole('button', { name: 'Download real-image.png', exact: true })).toBeVisible();
});

for (const action of ['clear', 'remove'] as const) {
  test(`${action} during real delayed decoding prevents stale results`, async ({ page }) => {
    await page.addInitScript(() => {
      const original = window.createImageBitmap.bind(window);
      window.createImageBitmap = async (source: ImageBitmapSource, options?: ImageBitmapOptions) => { await new Promise(done => setTimeout(done, 700)); return original(source, options); };
    });
    await open(page);
    await add(page, ['lossy.webp', 'transparent.webp']);
    await expect(page.locator('.status-processing')).toHaveCount(1);
    if (action === 'clear') await page.getByRole('button', { name: 'Clear all' }).click();
    else await page.getByRole('button', { name: 'Remove lossy.webp', exact: true }).click();
    await expect(choose(page)).toBeEnabled();
    await expect(rows(page)).toHaveCount(action === 'clear' ? 0 : 1);
    await expect(page.locator('.status-success')).toHaveCount(action === 'clear' ? 0 : 1);
    await add(page, ['lossless.webp']);
    await run(page, action === 'clear' ? 1 : 2);
  });
}

test('PNG export failure is visible and retry performs a real conversion (fault injection)', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    let failOnce = true;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) { if (failOnce) { failOnce = false; callback(null); } else original.call(this, callback, type, quality); };
  });
  await open(page);
  await add(page, ['lossy.webp', 'transparent.webp']);
  await expect(page.locator('.status-error')).toHaveCount(1);
  await expect(page.locator('.status-success')).toHaveCount(1);
  await expect(page.getByText('Your browser could not create the PNG.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Retry lossy.webp', exact: true }).click();
  await expect(page.locator('.status-success')).toHaveCount(2);
  const result = await download(page, 'Download lossy.png', 'retry.png');
  expect(await inspectPng(page, result.bytes)).toMatchObject({ width: 640, height: 400 });
});

test('ZIP read failure has a recoverable error and single downloads still work (fault injection)', async ({ page }) => {
  await open(page);
  await add(page, ['transparent.webp']);
  await run(page, 1);
  await page.evaluate(() => {
    const original = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () { if (this.type === 'image/png') return Promise.reject(Error('Injected ZIP read failure')); return original.call(this); };
  });
  await page.getByRole('button', { name: 'Download all (.zip)' }).click();
  await expect(page.getByRole('alert')).toContainText('ZIP could not be created');
  await expect(page.getByRole('button', { name: 'Download all (.zip)' })).toBeEnabled();
  const result = await download(page, 'Download transparent.png', 'zip-fallback.png');
  expect(result.bytes[0]).toBe(137);
});

test('selected images and filenames generate no HTTP requests, and nothing is persisted', async ({ page }) => {
  const requests: { url: string; method: string; body: string | null }[] = [];
  await open(page);
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push({ url: request.url(), method: request.method(), body: request.postData() }); });
  await page.getByLabel('Choose WebP files', { exact: true }).setInputFiles({ name: 'confidential-client-name.webp', mimeType: 'image/webp', buffer: readFileSync(fixture('transparent.webp')) });
  await run(page, 1);
  await download(page, 'Download confidential-client-name.png', 'privacy.png');
  await download(page, 'Download all (.zip)', 'privacy.zip');
  expect(requests).toEqual([]);
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, dbs: (await indexedDB.databases()).length, cookies: document.cookie }))).toEqual({ local: 0, session: 0, dbs: 0, cookies: '' });
  writeFileSync(path.join(evidence, 'privacy-network.json'), JSON.stringify({ phase: 'selection, conversion, PNG and ZIP download; excludes subsequent page reload', httpRequests: requests, persistentStorageEntries: 0 }, null, 2));
  await page.reload();
  await expect(choose(page)).toBeEnabled();
  await expect(rows(page)).toHaveCount(0);
});

test('enabled analytics sends a sanitized funnel and blocked analytics never stops conversion', async ({ page }) => {
  const events: { name: string; props: Record<string, unknown>; url: string }[] = [];
  let blocked = false;
  // Exercise the production marker in the local build; every provider request is intercepted.
  await page.route('http://127.0.0.1:8787/**', async route => {
    if (!route.request().isNavigationRequest() || new URL(route.request().url()).pathname !== '/') return route.continue();
    const response = await route.fetch();
    const body = (await response.text()).replace('<head>', '<head><meta name="analytics-domain" content="127.0.0.1"><link rel="canonical" href="http://127.0.0.1:8787/">');
    await route.fulfill({ response, body });
  });
  await page.route('https://plausible.io/api/event', async route => {
    if (blocked) return route.abort();
    events.push(route.request().postDataJSON());
    await route.fulfill({ status: 202, headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
  });
  await page.goto('/?private-query=secret#private-fragment');
  await expect(choose(page)).toBeEnabled();
  await page.getByLabel('Choose WebP files', { exact: true }).setInputFiles([
    { name: 'confidential-client.webp', mimeType: 'image/webp', buffer: readFileSync(fixture('transparent.webp')) },
    { name: 'private-broken.webp', mimeType: 'image/webp', buffer: Buffer.from('bad') },
  ]);
  await run(page, 1);
  await download(page, 'Download confidential-client.png', 'analytics.png');
  await expect.poll(() => events.map(event => event.name)).toEqual(expect.arrayContaining(['pageview', 'files_selected', 'conversion_started', 'conversion_succeeded', 'conversion_completed', 'conversion_failed', 'download_clicked']));
  expect(events.find(event => event.name === 'conversion_failed')?.props).toEqual({ stage: 'validation', reason: 'damaged_file' });
  expect(events.every(event => event.url === 'http://127.0.0.1:8787/')).toBe(true);
  expect(JSON.stringify(events)).not.toMatch(/confidential|private|secret|\.webp|\.png/);
  blocked = true;
  await page.getByRole('button', { name: 'Clear all' }).click();
  await add(page, ['lossy.webp']);
  await run(page, 1);
  await expect(page.getByRole('button', { name: 'Download lossy.png', exact: true })).toBeEnabled();
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
  test(`layout and long filenames at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    expect((await choose(page).boundingBox())!.y).toBeLessThan(viewport.height);
    await page.getByLabel('Choose WebP files', { exact: true }).setInputFiles({ name: '<img onerror=alert(1)>-' + 'very-long-name-'.repeat(10) + '.webp', mimeType: 'image/webp', buffer: readFileSync(fixture('transparent.webp')) });
    await run(page, 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('.file-label img')).toHaveCount(0);
    await page.screenshot({ path: path.join(evidence, `layout-${viewport.width}.png`), fullPage: true });
    if (viewport.width === 390) await page.screenshot({ path: path.join(evidence, 'mobile-390-viewport.png') });
    await page.getByRole('button', { name: /^Preview / }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: path.join(evidence, `preview-${viewport.width}.png`) });
    await page.keyboard.press('Escape');
  });
}

test('guide examples and completed screenshot are visible, including on mobile', async ({ page }) => {
  await page.goto('/guides/convert-webp-to-png/');
  await expect(page.getByRole('table')).toContainText('55,569');
  const images = page.locator('.guide-image');
  await expect(images).toHaveCount(2);
  await images.last().scrollIntoViewIfNeeded();
  expect(await images.evaluateAll(nodes => nodes.every(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.screenshot({ path: path.join(evidence, 'guide-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(evidence, 'guide-mobile.png'), fullPage: true });
});

test('keyboard selection, conversion, and download; inactive actions disabled in empty state', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('button', { name: 'Download all (.zip)' })).toBeDisabled();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  await expect(choose(page)).toBeFocused();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles(fixture('lossy.webp'));
  await expect(page.locator('.status-success')).toHaveCount(1);
  await page.getByRole('button', { name: 'Download lossy.png', exact: true }).focus();
  const pending = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expect((await pending).suggestedFilename()).toBe('lossy.png');
});

test('SEO is readable without JavaScript and converter controls are not falsely usable', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:8787/');
  await expect(page.getByRole('heading', { name: 'Free WebP to PNG Converter', exact: true })).toBeVisible();
  await expect(page.locator('noscript p')).toContainText('This converter needs JavaScript');
  await expect(page.locator('noscript p')).toBeVisible();
  await expect(choose(page)).not.toBeVisible();
  await expect(page.getByText('Are my images uploaded?', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidence, 'no-javascript.png'), fullPage: true });
  await context.close();
});

test('unhydrated island has a readable loading state and disabled controls', async ({ page }) => {
  await page.route('**/*.js', route => route.abort());
  await page.goto('/');
  await expect(page.getByText('Loading the local converter…')).toBeVisible();
  await expect(choose(page)).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Free WebP to PNG Converter', exact: true })).toBeVisible();
});

test('Cloudflare static routes, unique SEO, internal links, trailing slash and actual 404', async ({ page, request }) => {
  const routes = ['/', '/guides/convert-webp-to-png/', '/about/', '/privacy/', '/terms/'];
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const route of routes) {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toMatch(/<html lang="en"/);
    expect(html).toContain('<h1');
    expect(html).toContain('noindex, follow');
    expect(html).not.toContain('rel="canonical"');
    titles.add(html.match(/<title>(.*?)<\/title>/)![1]);
    descriptions.add(html.match(/name="description" content="([^"]+)"/)![1]);
    await page.goto(route);
    const hrefs = await page.locator('a[href^="/"]').evaluateAll(links => links.map(link => link.getAttribute('href')!));
    for (const href of new Set(hrefs)) expect((await request.get(href)).status(), `${route} → ${href}`).toBe(200);
  }
  expect(titles.size).toBe(routes.length);
  expect(descriptions.size).toBe(routes.length);
  const redirect = await request.get('/about', { maxRedirects: 0 });
  expect(redirect.status()).toBe(307);
  expect(redirect.headers().location).toBe('/about/');
  const missing = await request.get('/a-page-that-does-not-exist/');
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain('This page isn’t here.');
  expect(await (await request.get('/robots.txt')).text()).not.toContain('Sitemap:');
  expect((await request.get('/sitemap-index.xml')).status()).toBe(404);
  writeFileSync(path.join(evidence, 'routing.json'), JSON.stringify({ server: 'Wrangler local Workers Static Assets', routes, pageStatus: 200, missingStatus: 404, trailingSlashRedirect: 307, environment: 'local: noindex, no canonical, no sitemap' }, null, 2));
});
