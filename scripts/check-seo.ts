import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { auditHtml } from './audit-html.ts';

// Synthetic DNS-shaped origin for isolated build assertions only. No requests or deployment.
const fixtureOrigin = 'https://converter.acme.org';
const results = [];
for (const environment of ['local', 'preview', 'production']) {
  const directory = `output/seo-${environment}`;
  const build = spawnSync(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--outDir', directory], {
    env: { ...process.env, NODE_ENV: 'production', DEPLOY_ENV: environment, SITE_URL: fixtureOrigin, MAINTAINER_NAME: 'Build test fixture', CONTACT_EMAIL: 'qa@acme.org', PLAUSIBLE_ENABLED: 'true', ASTRO_TELEMETRY_DISABLED: '1' },
    encoding: 'utf8',
  });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  results.push({ environment, ...auditHtml(resolve(directory), environment === 'production' ? fixtureOrigin : undefined) });
  const html = readFileSync(`${directory}/index.html`, 'utf8');
  assert.equal(html.includes('name="analytics-domain"'), environment === 'production', 'Analytics only enabled in production');
  const privacy = readFileSync(`${directory}/privacy/index.html`, 'utf8');
  assert.ok(privacy.includes(environment === 'production' ? 'Plausible Analytics' : 'Production analytics is disabled'), 'Privacy matches the build');
  assert.ok(!readFileSync(`${directory}/404.html`, 'utf8').includes('name="analytics-domain"'), 'Do not send arbitrary missing-page paths to analytics');
}
const invalid = spawnSync(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--outDir', 'output/seo-rejected'], { env: { ...process.env, DEPLOY_ENV: 'production', SITE_URL: '', ASTRO_TELEMETRY_DISABLED: '1' }, encoding: 'utf8' });
assert.notEqual(invalid.status, 0, 'Missing production domain must fail before building');
mkdirSync('output', { recursive: true });
writeFileSync('output/seo-audit.json', JSON.stringify({ results, productionWithoutDomain: 'correctly rejected', fixtureOrigin, note: 'Isolated build fixtures only; not a configured or deployed production domain.' }, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
console.log('SEO build matrix passed; production without a domain was correctly rejected.');
