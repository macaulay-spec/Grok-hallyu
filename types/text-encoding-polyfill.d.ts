// Minimal ambient types for `text-encoding-polyfill` (ships no .d.ts; @types exists only for the
// older `text-encoding` package). Only the surface lib/polyfills.ts uses is declared.
declare module 'text-encoding-polyfill' {
  export class TextDecoder {
    constructor(encoding?: string);
    decode(bytes?: ArrayBufferView | ArrayBuffer | null): string;
  }
  export class TextEncoder {
    constructor();
    encode(text?: string): Uint8Array;
  }
}
