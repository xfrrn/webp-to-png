type EventName = 'files_selected' | 'conversion_started' | 'conversion_completed' | 'download_clicked';
const keys: Record<EventName, string[]> = {
  files_selected: ['count', 'size_bucket'],
  conversion_started: ['count'],
  conversion_completed: ['success', 'failed', 'cancelled', 'duration_bucket'],
  download_clicked: ['type', 'count'],
};
const enums: Record<string, string[]> = {
  size_bucket: ['under_1mb', '1_to_5mb', '5_to_10mb'],
  duration_bucket: ['under_1s', '1_to_5s', '5_to_30s', 'over_30s'],
  type: ['png', 'zip'],
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
export const sizeBucket = (bytes: number) => bytes < 1_000_000 ? 'under_1mb' : bytes < 5_000_000 ? '1_to_5mb' : '5_to_10mb';
export const durationBucket = (ms: number) => ms < 1_000 ? 'under_1s' : ms < 5_000 ? '1_to_5s' : ms < 30_000 ? '5_to_30s' : 'over_30s';
export function track(event: EventName, properties: Record<string, unknown>) {
  try {
    // Future providers belong here. No network adapter or third-party script is enabled.
    if (import.meta.env.DEV) console.debug('[analytics:local]', event, sanitize(event, properties));
  } catch { /* Analytics must never interrupt a conversion. */ }
}
