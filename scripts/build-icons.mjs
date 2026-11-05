// 由 public/favicon.svg 產生 PWA 圖示（192、512、可遮罩 512、Apple 180），使用 Playwright 轉成 PNG。
// 用法：npm run build:icons（需要已安裝 Playwright 與 Chromium）
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  const globalRoot = execSync('npm root -g').toString().trim();
  playwright = require(path.join(globalRoot, 'playwright'));
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(path.join(root, 'public/favicon.svg'), 'utf8');
const out = path.join(root, 'public/icons');
mkdirSync(out, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, pad: 0, bg: 'transparent' },
  { file: 'icon-512.png', size: 512, pad: 0, bg: 'transparent' },
  { file: 'icon-maskable-512.png', size: 512, pad: 66, bg: '#1f4020' },
  { file: 'apple-touch-icon.png', size: 180, pad: 15, bg: '#1f4020' }
];
const browser = await playwright.chromium.launch();
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
  const inner = t.size - t.pad * 2;
  await page.setContent(
    `<html><body style="margin:0;background:${t.bg};width:${t.size}px;height:${t.size}px;display:flex;align-items:center;justify-content:center">` +
      svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `) +
      '</body></html>'
  );
  await page.screenshot({ path: path.join(out, t.file), omitBackground: t.bg === 'transparent' });
  await page.close();
}
await browser.close();
console.log('icons done');
