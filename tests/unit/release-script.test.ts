import { mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

const script = resolve('scripts/check-release.ts');
const currentConfig = readFileSync('wrangler.jsonc', 'utf8');
const strictConfig = JSON.stringify({ assets: { directory: './dist', html_handling: 'force-trailing-slash', not_found_handling: '404-page' } });
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'webp-release-'));
  writeFileSync(join(directory, '.node-version'), process.versions.node);
});
afterEach(() => {
  for (const file of readdirSync(directory)) unlinkSync(join(directory, file));
  rmdirSync(directory);
});

function check(config?: string) {
  if (config !== undefined) writeFileSync(join(directory, 'wrangler.jsonc'), config);
  const result = spawnSync(process.execPath, [script], {
    cwd: directory, encoding: 'utf8',
    // Deliberately omit release settings: config tests must not depend on an existing dist.
    env: { ...process.env, DEPLOY_ENV: 'local', SITE_URL: '', MAINTAINER_NAME: '', CONTACT_EMAIL: '' },
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Production requires a real HTTPS SITE_URL.');
  return result.stderr;
}

it.each([strictConfig, currentConfig, `// Line comment\n/* Block comment */\n${currentConfig}`])('accepts strict JSON and the current JSONC with comments / trailing commas (%#)', config => {
  const errors = check(config);
  expect(errors).not.toMatch(/wrangler\.jsonc:|Wrangler must|\.node-version:|pinned Node/);
});

it('rejects parser recovery with a precise syntax location', () => {
  expect(check(`${strictConfig}\n!`)).toContain('wrangler.jsonc: InvalidSymbol at line 2, column 1.');
});

it.each(['{}', 'null', strictConfig.replace('./dist', './wrong')])('keeps the static routing guard for invalid config (%#)', config => {
  expect(check(config)).toContain('Wrangler must serve dist directly');
});

it('reports missing files separately', () => {
  unlinkSync(join(directory, '.node-version'));
  const errors = check();
  expect(errors).toMatch(/wrangler\.jsonc:.*ENOENT/);
  expect(errors).toMatch(/\.node-version:.*ENOENT/);
});

it('still rejects a mismatched Node version', () => {
  writeFileSync(join(directory, '.node-version'), '0.0.0');
  expect(check(strictConfig)).toContain('Use the pinned Node version');
});
