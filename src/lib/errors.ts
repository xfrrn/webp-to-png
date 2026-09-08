export const errorMessages = {
  invalid_format: 'This is not a WebP image. Choose a static WebP file.',
  damaged_file: 'This WebP file is empty, damaged, or incomplete. Try exporting it again.',
  animation: 'Animated WebP is not supported. Choose a static image instead.',
  file_size: 'This file exceeds the 10 MB input limit.',
  file_count: 'Your queue can hold up to 10 images. Remove some files and try again.',
  pixels: 'This image exceeds the 20 megapixel limit. Resize it before converting.',
  decode: 'Your browser could not decode this WebP. Try exporting it again or use an updated browser.',
  export: 'Your browser could not create the PNG. Free some memory and retry.',
  result_limit: 'The 100 MB result limit would be exceeded. Download and remove completed images, then retry.',
  zip_limit: 'ZIP downloads are limited to 50 MB of PNG files. Download individually or remove some results.',
  zip: 'The ZIP could not be created. Retry or download each PNG separately.',
  download: 'The download could not be started. Try again in an updated browser.',
  cancelled: 'This operation was cancelled.',
} as const;
export type ErrorCode = keyof typeof errorMessages;
export class ToolError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode) { super(errorMessages[code]); this.code = code; }
}
export const errorCode = (error: unknown, fallback: ErrorCode): ErrorCode => error instanceof ToolError ? error.code : fallback;
