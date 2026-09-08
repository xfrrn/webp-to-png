import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { LIMITS, formatBytes } from '../../src/config/limits';
import { releaseErrors, siteConfig } from '../../src/config/site';
import { checkCount, checkFileSize, checkPixels, inspectWebP } from '../../src/lib/webp';
import { pngName, makeZip } from '../../src/lib/files';
import { sanitize, track } from '../../src/lib/analytics';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url))).buffer;
describe('WebP trust boundary and project limits', () => {
  it.each([['lossy.webp', 640, 400], ['lossless.webp', 640, 400], ['transparent.webp', 320, 240]])('reads real %s dimensions', (name, width, height) => {
    expect(inspectWebP(fixture(name as string))).toEqual({ width, height });
  });
  it.each(['animated.webp', 'over-pixels.webp', 'truncated.webp', 'empty.webp', 'disguised.webp'])('rejects %s', name => expect(() => inspectWebP(fixture(name))).toThrow());
  it('enforces chunk bounds, reserved bits and container length', () => {
    const bytes = new Uint8Array(fixture('lossy.webp'));
    new DataView(bytes.buffer).setUint32(16, bytes.length, true);
    expect(() => inspectWebP(bytes.buffer)).toThrow(/damaged/);
    const animated = new Uint8Array(fixture('animated.webp'));
    animated[20] |= 0x80;
    expect(() => inspectWebP(animated.buffer)).toThrow(/damaged/);
  });
  it('does not confuse payload text with animation chunks', () => {
    const original = new Uint8Array(fixture('lossless.webp'));
    const bytes = new Uint8Array(original.length + 12);
    bytes.set(original);
    bytes.set(new TextEncoder().encode('JUNK'), original.length);
    new DataView(bytes.buffer).setUint32(original.length + 4, 4, true);
    bytes.set(new TextEncoder().encode('ANIM'), original.length + 8);
    new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
    expect(inspectWebP(bytes.buffer)).toEqual({ width: 640, height: 400 });
  });
  it('accepts boundary values and rejects excessive or empty input', () => {
    expect(() => checkCount(8, 2)).not.toThrow();
    expect(() => checkCount(9, 2)).toThrow(/10 images/);
    expect(() => checkFileSize(LIMITS.inputBytes)).not.toThrow();
    expect(() => checkFileSize(LIMITS.inputBytes + 1)).toThrow(/10 MB/);
    expect(() => checkFileSize(0)).toThrow();
    expect(() => checkPixels({ width: 5000, height: 4000 })).not.toThrow();
    expect(() => checkPixels({ width: 5001, height: 4000 })).toThrow(/20 megapixel/);
    expect(() => checkPixels({ width: 0, height: 50 })).toThrow();
    expect(formatBytes(1_000_000)).toBe('1.00 MB');
  });
});
describe('safe download names', () => {
  it('removes paths, controls, device names, long names, and conflicting extensions', () => {
    expect(pngName('../../CON.webp', [])).toBe('_CON.png');
    expect(pngName('C:\\private\\photo.webp', [])).toBe('photo.png');
    expect(pngName('<img>\u202e.webp', [])).toBe('_img__.png');
    expect(pngName('..', [])).toBe('image.png');
    expect(pngName('a'.repeat(300) + '.webp', []).length).toBe(104);
    expect(pngName('PHOTO.webp', ['photo.png', 'PHOTO (2).png'])).toBe('PHOTO (3).png');
  });
  it('rejects ZIP allocation above the total budget', async () => {
    await expect(makeZip([{ name: 'test.png', blob: { size: LIMITS.zipBytes + 1 } as Blob }], new AbortController().signal)).rejects.toThrow(/50 MB/);
  });
});
describe('analytics privacy', () => {
  it('only permits aggregate properties and known values', () => {
    expect(sanitize('files_selected', { count: 2, size_bucket: 'under_1mb', filename: 'secret.webp', path: '/private', image: 'base64' })).toEqual({ count: 2, size_bucket: 'under_1mb' });
    expect(sanitize('conversion_completed', { success: 99, failed: -1, cancelled: 1, duration_bucket: 'private/path' })).toEqual({ cancelled: 1 });
    expect(sanitize('download_clicked', { count: 'png', type: 1 })).toEqual({});
  });
  it('swallows analytics failures', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => { throw Error('unavailable'); });
    expect(() => track('conversion_started', { count: 1 })).not.toThrow();
    debug.mockRestore();
  });
});
describe('indexing and release configuration', () => {
  it.each(['local', 'preview'])('%s remains noindex even in production NODE_ENV', mode => {
    expect(siteConfig({ DEPLOY_ENV: mode, NODE_ENV: 'production', SITE_URL: 'https://converter.acme.org' })).toMatchObject({ indexable: false, origin: undefined });
  });
  it.each(['', 'https://example.com', 'http://converter.acme.org', 'https://localhost', 'https://preview.acme.org', 'https://app.workers.dev', 'https://acme.test', 'https://127.0.0.1', 'https://acme.org/path', 'https://acme.org/?query=1'])('blocks invalid production origin %s', origin => {
    expect(() => siteConfig({ DEPLOY_ENV: 'production', SITE_URL: origin })).toThrow();
  });
  it('accepts a production origin, rejects missing external settings', () => {
    const env = { DEPLOY_ENV: 'production', SITE_URL: 'https://converter.acme.org', MAINTAINER_NAME: 'QA fixture', CONTACT_EMAIL: 'qa@acme.org' };
    expect(siteConfig(env)).toMatchObject({ indexable: true, origin: 'https://converter.acme.org' });
    expect(releaseErrors(env)).toEqual([]);
    expect(releaseErrors({})).toHaveLength(4);
  });
});
