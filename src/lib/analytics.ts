import { errorMessages } from './errors';

type EventName = 'pageview' | 'files_selected' | 'conversion_started' | 'conversion_succeeded' | 'conversion_completed' | 'conversion_failed' | 'download_clicked';
const keys: Record<EventName, string[]> = {
  pageview: [],
  files_selected: ['count', 'size_bucket'],
  conversion_started: ['count'],
  conversion_succeeded: ['count'],
  conversion_completed: ['success', 'failed', 'cancelled', 'duration_bucket'],
  download_clicked: ['type', 'count'],
  conversion_failed: ['stage', 'reason'],
};
const enums: Record<string, string[]> = {
  size_bucket: ['under_1mb', '1_to_5mb', '5_to_10mb', 'over_10mb'],
  duration_bucket: ['under_1s', '1_to_5s', '5_to_30s', 'over_30s'],
  type: ['png', 'zip'],
  stage: ['validation', 'conversion', 'zip', 'download'],
  reason: Object.keys(errorMessages),
};
export function sanitize(event: EventName, properties: Record<string, unknown>) {
  const clean: Record<string, string | number> = {};
  for (const key of keys[event] || []) {
    const value = properties[key];
    if (enums[key]) {
      if (typeof value === 'string' && enums[key].includes(value)) clean[key] = value;
    } else if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10) clean[key] = value;
  }
  return clean;
}
export const sizeBucket = (bytes: number) => bytes < 1_000_000 ? 'under_1mb' : bytes < 5_000_000 ? '1_to_5mb' : bytes <= 10_000_000 ? '5_to_10mb' : 'over_10mb';
export const durationBucket = (ms: number) => ms < 1_000 ? 'under_1s' : ms < 5_000 ? '1_to_5s' : ms < 30_000 ? '5_to_30s' : 'over_30s';
export function track(event: EventName, properties: Record<string, unknown> = {}) {
  try {
    if (!Object.hasOwn(keys, event)) return;
    const props = sanitize(event, properties);
    if (import.meta.env.DEV) { console.debug('[analytics:local]', event, props); return; }
    if (typeof document === 'undefined') return;
    // These markers are emitted only for explicitly enabled production builds.
    const domain = document.querySelector<HTMLMetaElement>('meta[name="analytics-domain"]')?.content;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
    if (!domain || !canonical || new URL(canonical).origin !== location.origin) return;
    void fetch('https://plausible.io/api/event', {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true,
      body: JSON.stringify({ name: event, domain, url: canonical, props, ...(document.referrer ? { referrer: new URL(document.referrer).origin } : {}) }),
    }).catch(() => { /* A blocked or unavailable provider must not affect the tool. */ });
  } catch { /* Analytics must never interrupt a conversion. */ }
}
