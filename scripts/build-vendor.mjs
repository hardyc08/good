// 產生前端使用的第三方套件（已提交到 public/assets/vendor，平常不需要重跑）：
//  1. Anthropic 官方 SDK 的瀏覽器版（後台「瀏覽器直接呼叫 AI」功能使用）
//  2. QR Code 產生器（後台推廣 QR Code 使用）
// 用法：npm run build:vendor
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public/assets/vendor');
mkdirSync(out, { recursive: true });

const entry = path.join(root, 'scripts/.sdk-entry.mjs');
writeFileSync(entry, "import Anthropic from '@anthropic-ai/sdk';\nglobalThis.AnthropicSDK = Anthropic;\n");
const sdkVersion = JSON.parse(readFileSync(path.join(root, 'node_modules/@anthropic-ai/sdk/package.json'), 'utf8')).version;
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2019'],
  minify: true,
  legalComments: 'none',
  banner: { js: `/* @anthropic-ai/sdk ${sdkVersion} — MIT License — https://github.com/anthropics/anthropic-sdk-typescript */` },
  outfile: path.join(out, 'anthropic-sdk.min.js')
});
copyFileSync(path.join(root, 'node_modules/qrcode-generator/qrcode.js'), path.join(out, 'qrcode.js'));
for (const f of ['anthropic-sdk.min.js', 'qrcode.js']) {
  console.log(f, (statSync(path.join(out, f)).size / 1024).toFixed(1) + ' KB');
}
