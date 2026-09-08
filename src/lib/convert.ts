import { ToolError } from './errors';
import { checkPixels, validateFile } from './webp';

export async function convertWebP(file: File, signal: AbortSignal) {
  const expected = await validateFile(file);
  signal.throwIfAborted();
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'none' }); }
  catch { throw new ToolError('decode'); }
  const canvas = document.createElement('canvas');
  try {
    signal.throwIfAborted();
    checkPixels(bitmap);
    if (bitmap.width !== expected.width || bitmap.height !== expected.height) throw new ToolError('damaged_file');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new ToolError('export');
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      try { canvas.toBlob(value => value?.type === 'image/png' ? resolve(value) : reject(new ToolError('export')), 'image/png'); }
      catch { reject(new ToolError('export')); }
    });
    signal.throwIfAborted();
    return { blob, ...expected };
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}
