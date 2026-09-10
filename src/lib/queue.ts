import { LIMITS } from '../config/limits';
import { track, durationBucket, sizeBucket } from './analytics';
import { convertWebP } from './convert';
import { ToolError, errorCode, errorMessages, type ErrorCode } from './errors';
import { downloadUrl, makeZip, pngName } from './files';
import { validateFile, type Dimensions } from './webp';

export type Item = {
  id: string; originalName: string; name: string; inputBytes: number; file?: File;
  status: 'checking' | 'queued' | 'processing' | 'success' | 'error';
  dimensions?: Dimensions; blob?: Blob; url?: string; error?: ErrorCode;
};
type State = { items: Item[]; skipped: string[]; importing: boolean; running: boolean; packing: boolean; message: string; summary: string };

// One controller owns the queue; React only subscribes and renders it.
export class ConversionQueue {
  private state: State = { items: [], skipped: [], importing: false, running: false, packing: false, message: '', summary: '' };
  private listeners = new Set<() => void>();
  private generation = 0;
  private conversion?: AbortController;
  private packing?: AbortController;
  private downloads = new Map<string, ReturnType<typeof setTimeout>>();
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<State>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); }
  private patch(id: string, patch: Partial<Item>) { this.update({ items: this.state.items.map(item => item.id === id ? { ...item, ...patch } : item) }); }
  private exists(id: string) { return this.state.items.some(item => item.id === id); }
  private releaseDownload(url: string) { clearTimeout(this.downloads.get(url)); this.downloads.delete(url); URL.revokeObjectURL(url); }

  async add(files: File[]) {
    if (!files.length || this.state.importing || this.state.running || this.state.packing) return;
    const available = LIMITS.files - this.state.items.length;
    const skipped = files.slice(available).map(file => file.name);
    files = files.slice(0, available);
    this.update({ skipped, message: '' });
    if (!files.length) return;
    const generation = this.generation;
    const used = this.state.items.map(item => item.name);
    const added: Item[] = files.map(file => {
      const name = pngName(file.name, used);
      used.push(name);
      return { id: crypto.randomUUID(), originalName: file.name, name, file, inputBytes: file.size, status: 'checking' };
    });
    this.update({ items: [...this.state.items, ...added], importing: true, message: '', summary: '' });
    track('files_selected', { count: added.length, size_bucket: sizeBucket(Math.max(...added.map(item => item.inputBytes))) });
    try {
      for (const item of added) {
        if (generation !== this.generation) break;
        if (!this.exists(item.id)) continue;
        try {
          const dimensions = await validateFile(item.file!);
          if (generation !== this.generation || !this.exists(item.id)) continue;
          this.patch(item.id, { status: 'queued', dimensions });
        } catch (error) {
          if (generation === this.generation && this.exists(item.id)) {
            const reason = errorCode(error, 'damaged_file');
            this.patch(item.id, { status: 'error', error: reason, file: undefined });
            track('conversion_failed', { stage: 'validation', reason });
          }
        }
      }
    } finally { this.update({ importing: false }); }
    if (generation === this.generation) await this.start();
  }

  async start(onlyId?: string) {
    if (this.state.running || this.state.importing || this.state.packing) return;
    const batch = this.state.items.filter(item => item.file && (onlyId ? item.id === onlyId && item.status === 'error' : item.status === 'queued'));
    if (!batch.length) return;
    const controller = new AbortController();
    this.conversion = controller;
    const started = performance.now();
    this.update({ running: true, message: '', summary: '' });
    track('conversion_started', { count: batch.length });
    try {
      for (const item of batch) {
        if (controller.signal.aborted) break;
        if (!this.exists(item.id)) continue;
        this.patch(item.id, { status: 'processing', error: undefined });
        try {
          const result = await convertWebP(item.file!, controller.signal);
          if (controller.signal.aborted || !this.exists(item.id)) continue;
          const total = this.state.items.reduce((bytes, row) => bytes + (row.blob?.size || 0), 0);
          if (total + result.blob.size > LIMITS.resultBytes) throw new ToolError('result_limit');
          const url = URL.createObjectURL(result.blob);
          this.patch(item.id, { status: 'success', dimensions: { width: result.width, height: result.height }, blob: result.blob, url, file: undefined });
        } catch (error) {
          if (!controller.signal.aborted && this.exists(item.id)) {
            const reason = errorCode(error, 'export');
            this.patch(item.id, { status: 'error', error: reason });
            track('conversion_failed', { stage: 'conversion', reason });
          }
        }
      }
    } finally {
      const current = this.state.items.filter(item => batch.some(member => member.id === item.id));
      const success = current.filter(item => item.status === 'success').length;
      const failed = current.filter(item => item.status === 'error').length;
      const cancelled = batch.length - success - failed;
      if (success) track('conversion_succeeded', { count: success });
      track('conversion_completed', { success, failed, cancelled, duration_bucket: durationBucket(performance.now() - started) });
      this.conversion = undefined;
      this.update({ running: false, summary: cancelled ? `Conversion cancelled. ${success} ready, ${failed} failed, ${cancelled} cancelled.` : `${success} ready to download${failed ? `, ${failed} failed. Check the file messages below.` : '.'}` });
    }
  }

  remove(id: string) {
    this.packing?.abort();
    this.downloads.forEach((_, url) => this.releaseDownload(url));
    const item = this.state.items.find(item => item.id === id);
    if (item?.url) URL.revokeObjectURL(item.url);
    this.update({ items: this.state.items.filter(item => item.id !== id), message: '', summary: '' });
  }
  removeCompleted() {
    if (this.state.importing || this.state.running || this.state.packing) return;
    this.state.items.filter(item => item.status === 'success').forEach(item => this.remove(item.id));
  }
  clear() {
    this.generation++;
    this.conversion?.abort();
    this.packing?.abort();
    this.state.items.forEach(item => { if (item.url) URL.revokeObjectURL(item.url); });
    this.downloads.forEach((_, url) => this.releaseDownload(url));
    // Keep busy locks until outstanding native work settles; prevent overlapping decodes after Clear.
    this.update({ items: [], skipped: [], message: '', summary: '' });
  }
  download(id: string) {
    const item = this.state.items.find(item => item.id === id);
    if (!item?.url) return;
    track('download_clicked', { type: 'png', count: 1 });
    try { downloadUrl(item.url, item.name); }
    catch { this.update({ message: errorMessages.download }); track('conversion_failed', { stage: 'download', reason: 'download' }); }
  }
  async downloadZip() {
    if (this.state.packing || this.state.running || this.state.importing) return;
    this.downloads.forEach((_, url) => this.releaseDownload(url));
    const results = this.state.items.filter((item): item is Item & { blob: Blob } => item.status === 'success' && Boolean(item.blob));
    if (!results.length) return;
    track('download_clicked', { type: 'zip', count: results.length });
    const controller = new AbortController();
    this.packing = controller;
    this.update({ packing: true, message: '' });
    try {
      const blob = await makeZip(results, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      // Allow the browser to consume the download before releasing the short-lived ZIP URL.
      this.downloads.set(url, setTimeout(() => this.releaseDownload(url), 30_000));
      downloadUrl(url, 'converted-images.zip');
    } catch (error) {
      if (!controller.signal.aborted) {
        const reason = errorCode(error, 'zip');
        this.update({ message: errorMessages[reason] });
        track('conversion_failed', { stage: 'zip', reason });
      }
    } finally { this.packing = undefined; this.update({ packing: false }); }
  }
}
