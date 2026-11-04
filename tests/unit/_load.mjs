// 以 vm 在全域環境執行前端的一般 <script> 檔，讓測試可以使用 globalThis.YD。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../public/assets/js');

export const CORE_FILES = [
  'core/norms.js',
  'core/screening.js',
  'core/exercises.js',
  'core/prescription.js',
  'core/validate.js',
  'core/narrative.js',
  'core/assess.js',
  'data/demo.js'
];

export function loadCore(files = CORE_FILES) {
  for (const f of files) {
    const p = path.join(root, f);
    vm.runInThisContext(readFileSync(p, 'utf8'), { filename: p });
  }
  return globalThis.YD;
}
