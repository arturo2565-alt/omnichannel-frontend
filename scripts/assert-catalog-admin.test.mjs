import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const ADMIN = fileURLToPath(new URL('../src/CatalogAdminPage.jsx', import.meta.url));

const FORBIDDEN = [
  /RefaccionesCatalogTab/,
  /costoReferenciaBase/,
  /margenPorcentaje/,
  /id: 'refacciones'/,
];

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (/\.(jsx?|tsx?)$/.test(entry)) out.push(path);
  }
  return out;
}

test('el catálogo no ofrece editor de costo, margen ni precio genérico de refacción', () => {
  const admin = readFileSync(ADMIN, 'utf8');
  assert.match(admin, /mercado/);
  for (const pattern of FORBIDDEN) {
    assert.doesNotMatch(admin, pattern);
  }
  const files = sourceFiles(SRC);
  assert.ok(files.length > 0);
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of FORBIDDEN) {
      assert.doesNotMatch(text, pattern, file);
    }
  }
});
