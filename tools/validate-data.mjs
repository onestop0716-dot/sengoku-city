import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataNode } from '../src/data/registry.js';
import { validateData } from '../src/data/validate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = await loadDataNode(path.join(root, 'data'));
const { errors, warnings } = validateData(raw);
for (const w of warnings) console.warn('警告:', w);
for (const e of errors) console.error('エラー:', e);
console.log(errors.length ? `エラー ${errors.length} 件` : `OK（警告 ${warnings.length} 件）`);
process.exit(errors.length ? 1 : 0);
