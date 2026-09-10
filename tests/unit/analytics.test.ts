import { afterEach, expect, it, vi } from 'vitest';
import { sanitize, track, sizeBucket } from '../../src/lib/analytics';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('sends only whitelisted fields and canonical URLs, with no cookies or referrer paths', async () => {
  vi.stubEnv('DEV', false);
  const fetch = vi.fn().mockResolvedValue({});
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('location', { origin: 'https://converter.acme.org' });
  vi.stubGlobal('document', {
    referrer: 'https://www.google.com/search?q=private',
    querySelector: (selector: string) => selector.startsWith('meta') ? { content: 'converter.acme.org' } : { href: 'https://converter.acme.org/' },
  });
  track('conversion_failed', { stage: 'validation', reason: 'invalid_format', filename: 'private.webp', image: 'secret' });
  expect(fetch).toHaveBeenCalledWith('https://plausible.io/api/event', expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true }));
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ name: 'conversion_failed', domain: 'converter.acme.org', url: 'https://converter.acme.org/', props: { stage: 'validation', reason: 'invalid_format' }, referrer: 'https://www.google.com' });
  fetch.mockRejectedValue(new Error('offline'));
  expect(() => track('pageview')).not.toThrow();
  await Promise.resolve();
  expect(sanitize('conversion_failed', { reason: 'private-path', stage: 'anything' })).toEqual({});
  expect(sizeBucket(10_000_001)).toBe('over_10mb');
});

it('makes no requests without enabled markers or when a production build is served on another origin', () => {
  vi.stubEnv('DEV', false);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('document', { querySelector: () => null });
  track('pageview');
  vi.stubGlobal('location', { origin: 'https://preview.acme.org' });
  vi.stubGlobal('document', { querySelector: (selector: string) => selector.startsWith('meta') ? { content: 'converter.acme.org' } : { href: 'https://converter.acme.org/' } });
  track('pageview');
  expect(fetch).not.toHaveBeenCalled();
});
