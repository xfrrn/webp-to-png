import { LIMITS } from '../config/limits';
import { ToolError } from './errors';

export type Dimensions = { width: number; height: number };
export function checkPixels({ width, height }: Dimensions) {
  if (!width || !height || !Number.isSafeInteger(width * height)) throw new ToolError('damaged_file');
  if (width * height > LIMITS.pixels) throw new ToolError('pixels');
}
export function checkFileSize(size: number) {
  if (!size) throw new ToolError('damaged_file');
  if (size > LIMITS.inputBytes) throw new ToolError('file_size');
}

// Parse RIFF chunk boundaries; never identify animation by searching arbitrary payload bytes.
export function inspectWebP(buffer: ArrayBuffer): Dimensions {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const tag = (start: number) => String.fromCharCode(...bytes.subarray(start, start + 4));
  const bad = () => { throw new ToolError('damaged_file'); };
  if (bytes.length < 12) return bad();
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') throw new ToolError('invalid_format');
  if (view.getUint32(4, true) + 8 !== bytes.length) return bad();
  let extended: Dimensions | undefined;
  let image: Dimensions | undefined;
  let animated = false;
  let offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return bad();
    const kind = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + size;
    if (end + (size & 1) > bytes.length || (size & 1 && bytes[end] !== 0)) return bad();
    if (kind === 'VP8X') {
      if (offset !== 12 || size !== 10 || (bytes[start] & 0xc1) || bytes[start + 1] || bytes[start + 2] || bytes[start + 3]) return bad();
      const uint24 = (at: number) => bytes[at] | bytes[at + 1] << 8 | bytes[at + 2] << 16;
      extended = { width: uint24(start + 4) + 1, height: uint24(start + 7) + 1 };
      animated = Boolean(bytes[start] & 0x02);
    } else if (kind === 'ANIM' || kind === 'ANMF') {
      animated = true;
    } else if (kind === 'VP8 ') {
      if (image || size < 10 || (bytes[start] & 1) || bytes[start + 3] !== 0x9d || bytes[start + 4] !== 0x01 || bytes[start + 5] !== 0x2a) return bad();
      image = { width: view.getUint16(start + 6, true) & 0x3fff, height: view.getUint16(start + 8, true) & 0x3fff };
    } else if (kind === 'VP8L') {
      if (image || size < 5 || bytes[start] !== 0x2f) return bad();
      const bits = view.getUint32(start + 1, true);
      if (bits >>> 29) return bad();
      image = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    offset = end + (size & 1);
  }
  if (animated) throw new ToolError('animation');
  if (!image) return bad();
  if (extended && (extended.width !== image.width || extended.height !== image.height)) return bad();
  checkPixels(image);
  return image;
}

export async function validateFile(file: File) {
  checkFileSize(file.size);
  return inspectWebP(await file.arrayBuffer());
}
