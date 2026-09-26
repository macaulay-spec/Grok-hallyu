// Minimal ambient types for `@zxing/text-encoding` (the package ships no .d.ts).
// Only the WHATWG surface Hallyu polyfills onto globalThis is declared here —
// firestore constructs `new TextDecoder('utf-8')` and calls decode(view),
// and `new TextEncoder()` + encode(string).
declare module '@zxing/text-encoding' {
  export class TextDecoder {
    constructor(label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean });
    readonly encoding: string;
    readonly fatal: boolean;
    readonly ignoreBOM: boolean;
    decode(input?: ArrayBufferView | ArrayBuffer, options?: { stream?: boolean }): string;
  }

  export class TextEncoder {
    constructor();
    readonly encoding: 'utf-8';
    encode(input?: string): Uint8Array;
  }
}
