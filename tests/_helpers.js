import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataNode, createRegistry } from '../src/data/registry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let cached = null;
export async function getRegistry() {
  if (!cached) cached = createRegistry(await loadDataNode(path.join(root, 'data')));
  return cached;
}
