// Verifies the pure compositor burns the mark into real pixels (runs in node, no RN).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');
const ts = require('typescript');
const { transpileModule } = ts;

// transpile the TS compositor to CommonJS for node
const src = readFileSync(new URL('../lib/watermark.ts', import.meta.url), 'utf8');
const js = transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', js)(require, mod, mod.exports);
const { setWatermarkSource, burnIntoJpeg, hasWatermarkSource } = mod.exports;

setWatermarkSource(new Uint8Array(readFileSync(new URL('../assets/branding/watermark.png', import.meta.url))));
if (!hasWatermarkSource()) { console.error('FAIL: watermark source not loaded'); process.exit(1); }

// build a flat 400x300 mid-gray JPEG to mark
const w = 400, h = 300;
const data = Buffer.alloc(w * h * 4);
for (let i = 0; i < w * h; i++) { data[i * 4] = 120; data[i * 4 + 1] = 120; data[i * 4 + 2] = 120; data[i * 4 + 3] = 255; }
const base = jpeg.encode({ data, width: w, height: h }, 92);

const out = burnIntoJpeg(new Uint8Array(base.data));
if (!out) { console.error('FAIL: burnIntoJpeg returned null'); process.exit(1); }

// decode and count pixels that differ from gray in the bottom-right region
const dec = jpeg.decode(Buffer.from(out.bytes), { useTArray: true, formatAsRGBA: true });
let changed = 0;
for (let i = 0; i < w * h; i++) {
  const r = dec.data[i * 4], g = dec.data[i * 4 + 1], b = dec.data[i * 4 + 2];
  if (Math.abs(r - 120) > 12 || Math.abs(g - 120) > 12 || Math.abs(b - 120) > 12) changed++;
}
console.log('changed pixels:', changed);
if (changed < 2000) { console.error('FAIL: mark not visibly burned'); process.exit(1); }
console.log('watermark compositor OK');
