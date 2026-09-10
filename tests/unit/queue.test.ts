import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversionQueue } from '../../src/lib/queue';
import { convertWebP } from '../../src/lib/convert';
import { track } from '../../src/lib/analytics';
import { ToolError } from '../../src/lib/errors';
import { LIMITS } from '../../src/config/limits';

vi.mock('../../src/lib/convert', () => ({ convertWebP: vi.fn() }));
vi.mock('../../src/lib/analytics', async importOriginal => ({ ...await importOriginal<typeof import('../../src/lib/analytics')>(), track: vi.fn() }));
const file = (name = 'image.webp') => new File([readFileSync(new URL('../fixtures/transparent.webp', import.meta.url))], name);
const result = () => ({ width: 320, height: 240, blob: new Blob(['png'], { type: 'image/png' }) });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

describe('queue lifecycle and event semantics (conversion is stubbed only in these unit tests)', () => {
  let queue: ConversionQueue;
  beforeEach(() => { vi.clearAllMocks(); queue = new ConversionQueue(); vi.mocked(convertWebP).mockResolvedValue(result()); });
  afterEach(() => queue.clear());
  it('records selections and rejected inputs, converts valid files automatically with unique names', async () => {
    await queue.start();
    await queue.add([]);
    expect(track).not.toHaveBeenCalled();
    await queue.add([new File(['no image'], 'fake.webp')]);
    await queue.start();
    expect(track).toHaveBeenCalledWith('conversion_failed', { stage: 'validation', reason: 'damaged_file' });
    expect(convertWebP).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalledWith('conversion_succeeded', expect.anything());
    queue.clear();
    vi.clearAllMocks();
    await queue.add([file(), file()]);
    const items = queue.getSnapshot().items;
    expect(new Set(items.map(item => item.id)).size).toBe(2);
    expect(items.map(item => item.name)).toEqual(['image.png', 'image (2).png']);
    expect(items.every(item => item.status === 'success')).toBe(true);
    expect(track).toHaveBeenCalledWith('files_selected', { count: 2, size_bucket: 'under_1mb' });
    expect(track).toHaveBeenCalledWith('conversion_succeeded', { count: 2 });
  });
  it('serializes work and ignores repeated starts', async () => {
    const pending = deferred<ReturnType<typeof result>>();
    vi.mocked(convertWebP).mockReturnValueOnce(pending.promise);
    const running = queue.add([file(), file()]);
    await vi.waitFor(() => expect(convertWebP).toHaveBeenCalledTimes(1));
    await queue.start();
    expect(convertWebP).toHaveBeenCalledTimes(1);
    pending.resolve(result());
    await running;
    expect(convertWebP).toHaveBeenCalledTimes(2);
    expect(queue.getSnapshot().items.every(item => item.status === 'success')).toBe(true);
    expect(vi.mocked(track).mock.calls.filter(([event]) => event === 'conversion_started')).toHaveLength(1);
    expect(vi.mocked(track).mock.calls.filter(([event]) => event === 'conversion_completed')).toHaveLength(1);
  });
  it('clear prevents stale writes and reports cancellation instead of full success', async () => {
    const pending = deferred<ReturnType<typeof result>>();
    vi.mocked(convertWebP).mockReturnValueOnce(pending.promise);
    const running = queue.add([file(), file()]);
    await vi.waitFor(() => expect(convertWebP).toHaveBeenCalledTimes(1));
    queue.clear();
    expect(queue.getSnapshot().running).toBe(true);
    pending.resolve(result());
    await running;
    expect(queue.getSnapshot().items).toHaveLength(0);
    expect(track).toHaveBeenCalledWith('conversion_completed', expect.objectContaining({ success: 0, failed: 0, cancelled: 2 }));
  });
  it('clear during validation prevents old input returning', async () => {
    const pending = deferred<ArrayBuffer>();
    const original = file();
    vi.spyOn(original, 'arrayBuffer').mockReturnValue(pending.promise);
    const adding = queue.add([original]);
    queue.clear();
    pending.resolve(await file().arrayBuffer());
    await adding;
    expect(queue.getSnapshot().items).toHaveLength(0);
    expect(convertWebP).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalledWith('conversion_started', expect.anything());
  });
  it('remove during conversion drops only the removed result', async () => {
    const pending = deferred<ReturnType<typeof result>>();
    vi.mocked(convertWebP).mockReturnValueOnce(pending.promise);
    const running = queue.add([file(), file()]);
    await vi.waitFor(() => expect(convertWebP).toHaveBeenCalledTimes(1));
    queue.remove(queue.getSnapshot().items[0].id);
    pending.resolve(result());
    await running;
    expect(queue.getSnapshot().items).toHaveLength(1);
    expect(queue.getSnapshot().items[0].status).toBe('success');
  });
  it('failure does not stop siblings and a retry recovers', async () => {
    vi.mocked(convertWebP).mockRejectedValueOnce(new ToolError('export'));
    await queue.add([file(), file()]);
    await queue.start();
    expect(queue.getSnapshot().items.map(item => item.status)).toEqual(['error', 'success']);
    await queue.start(queue.getSnapshot().items[0].id);
    expect(queue.getSnapshot().items.every(item => item.status === 'success')).toBe(true);
  });
  it('bounds total result cache and releases object URLs', async () => {
    const first = result();
    Object.defineProperty(first.blob, 'size', { value: LIMITS.resultBytes });
    vi.mocked(convertWebP).mockResolvedValueOnce(first);
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    await queue.add([file(), file()]);
    await queue.start();
    expect(queue.getSnapshot().items[1].error).toBe('result_limit');
    queue.clear();
    expect(revoke).toHaveBeenCalledTimes(1);
    revoke.mockRestore();
  });
  it('accepts remaining slots, lists overflow files and never exceeds the queue limit', async () => {
    await queue.add([file('existing.webp')]);
    await queue.add(Array.from({ length: 11 }, (_, index) => file(`${index}.webp`)));
    expect(queue.getSnapshot().items).toHaveLength(10);
    expect(queue.getSnapshot().skipped).toEqual(['9.webp', '10.webp']);
    expect(convertWebP).toHaveBeenCalledTimes(10);
    await queue.add([file('full.webp')]);
    expect(queue.getSnapshot().skipped).toEqual(['full.webp']);
    expect(convertWebP).toHaveBeenCalledTimes(10);
  });
  it('removes completed results, releases URLs and preserves retryable failures', async () => {
    vi.mocked(convertWebP).mockRejectedValueOnce(new ToolError('export'));
    await queue.add([file('retry.webp'), file('done.webp')]);
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    queue.removeCompleted();
    expect(queue.getSnapshot().items.map(item => item.originalName)).toEqual(['retry.webp']);
    expect(revoke).toHaveBeenCalledTimes(1);
    revoke.mockRestore();
    await queue.start(queue.getSnapshot().items[0].id);
    await queue.add([file('next.webp')]);
    expect(queue.getSnapshot().items.map(item => item.status)).toEqual(['success', 'success']);
  });
});
