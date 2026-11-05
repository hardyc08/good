// 產生「單一檔案」的試用預覽頁（給 claude.ai 私人預覽使用）：
// 把 CSS 與所有 JS 內嵌到一個 HTML 片段，並開啟預覽模式（只用本機資料、不連線後端與 AI）。
// 用法：node scripts/build-preview.mjs [輸出路徑]（預設 dist/preview.html）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = (p) => path.join(root, 'public', p);
const out = path.resolve(process.argv[2] || path.join(root, 'dist/preview.html'));

const html = readFileSync(pub('index.html'), 'utf8');
const css = readFileSync(pub('assets/css/app.css'), 'utf8');

// index.html 中依序載入的腳本（不含第三方套件）
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const safe = (code) => code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

// 取出 <body> 內容，移除外部腳本標籤
const body = html
  .slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'))
  .replace(/\s*<!--[\s\S]*?-->/g, '')
  .replace(/\s*<script src="[^"]+"><\/script>/g, '')
  .trim();

const fontLink = (html.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]+>/) || [''])[0];

const parts = [
  '<title>銀動方程式</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<meta name="description" content="銀動方程式：AI 驅動的銀髮個人化運動處方系統（試用預覽版）">',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  fontLink,
  '<style>\n' + css + '\n</style>',
  '<script>window.YD_CONFIG = { preview: true };</script>',
  body
];
for (const src of scripts) {
  parts.push('<script>\n/* ' + src + ' */\n' + safe(readFileSync(pub(src), 'utf8')) + '\n</script>');
}
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, parts.join('\n') + '\n');
console.log('preview →', out, (Buffer.byteLength(parts.join('\n')) / 1024).toFixed(0) + ' KB', '(' + scripts.length + ' scripts)');
