// Project safeguards, not browser or hosting-provider limits. MB is decimal everywhere.
export const LIMITS = {
  files: 10,
  inputBytes: 10_000_000,
  pixels: 20_000_000,
  resultBytes: 100_000_000,
  zipBytes: 50_000_000,
} as const;

export function formatBytes(bytes: number) {
  if (bytes < 1_000) return `${bytes} B`;
  return bytes < 1_000_000 ? `${(bytes / 1_000).toFixed(1)} KB` : `${(bytes / 1_000_000).toFixed(2)} MB`;
}
