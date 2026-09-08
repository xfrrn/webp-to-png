import { zip } from 'fflate';
import { LIMITS } from '../config/limits';
import { ToolError } from './errors';

export function pngName(original: string, used: Iterable<string>) {
  const basename = original.split(/[\\/]/).pop() || 'image';
  // Control and bidi characters, path syntax, Windows device names and trailing dots are unsafe.
  let stem = basename.replace(/\.[^.]*$/, '').replace(/[<>:"/\\|?*\p{Cc}\p{Cf}]/gu, '_').trim().replace(/[. ]+$/g, '').slice(0, 100);
  if (!stem || /^\.+$/.test(stem)) stem = 'image';
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(stem)) stem = `_${stem}`;
  const names = new Set(Array.from(used, name => name.normalize('NFC').toLowerCase()));
  let candidate = `${stem}.png`;
  for (let n = 2; names.has(candidate.normalize('NFC').toLowerCase()); n++) candidate = `${stem} (${n}).png`;
  return candidate;
}

export function downloadUrl(url: string, name: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
}

export async function makeZip(results: { name: string; blob: Blob }[], signal: AbortSignal) {
  if (results.reduce((sum, item) => sum + item.blob.size, 0) > LIMITS.zipBytes) throw new ToolError('zip_limit');
  if (!results.length) throw new ToolError('zip');
  const entries: Record<string, Uint8Array> = Object.create(null);
  for (const result of results) {
    signal.throwIfAborted();
    entries[pngName(result.name, Object.keys(entries))] = new Uint8Array(await result.blob.arrayBuffer());
  }
  signal.throwIfAborted();
  return new Promise<Blob>((resolve, reject) => {
    // PNG is already compressed. Store entries to avoid wasting CPU on recompression.
    const terminate = zip(entries, { level: 0 }, (error, data) => {
      signal.removeEventListener('abort', cancel);
      if (error) reject(new ToolError('zip'));
      else resolve(new Blob([new Uint8Array(data)], { type: 'application/zip' }));
    });
    const cancel = () => { terminate(); reject(new ToolError('cancelled')); };
    signal.addEventListener('abort', cancel, { once: true });
  });
}
