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
    for (const match of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
      const target = match[1].endsWith('/') ? `${match[1].slice(1)}index.html` : match[1].slice(1);
      assert.ok(existsSync(join(directory, target)), `Missing asset/link ${route} → ${match[1]}`);
    }
  }
  const home = text('index.html');
  assert.ok(home.includes('Are my images uploaded?') && home.includes('These are this tool’s safeguards.'), 'Static FAQ and answers');
  assert.ok(home.includes('client="load"'), 'React client:load island');
  assert.ok(home.includes('This converter needs JavaScript'), 'No-JavaScript message');
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
  return { pages: 6, indexablePages: origin ? indexablePaths.length : 0, sitemapFiles: sitemaps };
}
