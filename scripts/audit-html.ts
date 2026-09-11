import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { indexablePaths } from '../src/config/site.ts';

export function auditHtml(directory: string, origin?: string) {
  const text = (file: string) => readFileSync(join(directory, file), 'utf8');
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const route of [...indexablePaths, '/404.html']) {
    const html = text(route === '/404.html' ? '404.html' : `${route.slice(1)}index.html`);
    const indexable = Boolean(origin) && route !== '/404.html';
    assert.match(html, /<html lang="en"/);
    assert.equal([...html.matchAll(/<h1[ >]/g)].length, 1, `One H1 on ${route}`);
    const title = html.match(/<title>(.*?)<\/title>/)?.[1];
    const description = html.match(/name="description" content="([^"]+)"/)?.[1];
    assert.ok(title && description, `Metadata on ${route}`);
    assert.ok(!titles.has(title) && !descriptions.has(description), `Unique metadata on ${route}`);
    titles.add(title); descriptions.add(description);
    assert.ok(html.includes(`content="${indexable ? 'index, follow' : 'noindex, follow'}"`), `Index policy on ${route}`);
    const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
    assert.equal(canonical, indexable ? `${origin}${route}` : undefined, `Canonical on ${route}`);
    const socialImage = html.match(/property="og:image" content="([^"]+)"/)?.[1];
    assert.equal(socialImage, indexable ? `${origin}/guide/conversion.png` : undefined, `Production share image on ${route}`);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.equal(html.match(/name="twitter:title" content="([^"]+)"/)?.[1], title, `Share title on ${route}`);
    assert.equal(html.match(/name="twitter:description" content="([^"]+)"/)?.[1], description, `Share description on ${route}`);
    assert.equal(html.match(/name="twitter:image" content="([^"]+)"/)?.[1], socialImage, `Matching share images on ${route}`);
    if (socialImage) {
      const png = readFileSync(join(directory, new URL(socialImage).pathname.slice(1)));
      assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Share image is an actual PNG');
      assert.equal(Number(html.match(/property="og:image:width" content="(\d+)"/)?.[1]), png.readUInt32BE(16));
      assert.equal(Number(html.match(/property="og:image:height" content="(\d+)"/)?.[1]), png.readUInt32BE(20));
      assert.match(html, /property="og:image:alt" content="[^"]+"/);
      assert.match(html, /name="twitter:image:alt" content="[^"]+"/);
    }
    for (const match of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
      const target = match[1].endsWith('/') ? `${match[1].slice(1)}index.html` : match[1].slice(1);
      assert.ok(existsSync(join(directory, target)), `Missing asset/link ${route} → ${match[1]}`);
    }
  }
  const home = text('index.html');
  assert.ok(home.includes('Are my images uploaded?') && home.includes('These are this tool’s safeguards.'), 'Static FAQ and answers');
  assert.ok(home.includes('client="load"'), 'React client:load island');
  assert.ok(home.includes('This converter needs JavaScript'), 'No-JavaScript message');
  const mainText = home.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)![1]
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ');
  const mainWords = mainText.match(/\b[A-Za-z0-9]+(?:['’][A-Za-z]+)?\b/g) || [];
  assert.ok(mainWords.length >= 1200 && mainWords.length <= 1800, `Homepage copy brief: 1200–1800 words, got ${mainWords.length}`);
  assert.match(mainWords.slice(0, 100).join(' '), /WebP to PNG/i, 'Conversion intent appears at the beginning');
  assert.match(home, /<img\b[^>]*src="\/guide\/conversion.png"[^>]*alt="[^"]+"/, 'Illustrated example with descriptive alt text');
  const schema = home.match(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.equal(Boolean(schema), Boolean(origin), 'Structured data only uses a configured production origin');
  if (schema) {
    const data = JSON.parse(schema);
    assert.equal(data['@context'], 'https://schema.org');
    assert.deepEqual(data['@graph'].map((node: { '@type': string }) => node['@type']), ['WebSite', 'WebApplication']);
    const [website, app] = data['@graph'];
    assert.equal(website.url, `${origin}/`);
    assert.equal(app.url, `${origin}/`);
    assert.equal(app.isPartOf['@id'], website['@id']);
    assert.equal(app.offers.price, 0, 'Application is free');
    assert.equal(app.screenshot, `${origin}/guide/conversion.png`);
  }
  const robots = text('robots.txt');
  const sitemaps = readdirSync(directory).filter(name => /^sitemap.*\.xml$/.test(name));
  if (!origin) {
    assert.equal(sitemaps.length, 0, 'No noindex pages in a non-production sitemap');
    assert.ok(!robots.includes('Sitemap:'));
  } else {
    const indexName = robots.match(/^Sitemap: (.+)$/m)?.[1];
    assert.ok(indexName, 'robots.txt sitemap reference');
    assert.equal(new URL(indexName).origin, origin);
    const index = text(new URL(indexName).pathname.slice(1));
    const children = [...index.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
    assert.ok(children.length > 0);
    const urls: string[] = [];
    for (const child of children) {
      assert.equal(new URL(child).origin, origin);
      const xml = text(new URL(child).pathname.slice(1));
      urls.push(...[...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]));
    }
    assert.deepEqual(urls.sort(), indexablePaths.map(route => `${origin}${route}`).sort());
  }
  return { pages: 6, indexablePages: origin ? indexablePaths.length : 0, sitemapFiles: sitemaps, homeMainWords: mainWords.length, structuredData: Boolean(schema) };
}
