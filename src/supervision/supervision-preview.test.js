import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SUPERVISION_PREVIEW_CASES } from './supervision-preview-fixtures.js';

test('la vista de inspección no entra en la bandeja', () => {
  const chat = readFileSync(new URL('../ChatView.jsx', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
  assert.equal(chat.includes('supervision-preview'), false);
  assert.equal(chat.includes('SUPERVISION_PREVIEW_CASES'), false);
  assert.match(main, /import\.meta\.env\.DEV/);
  assert.equal(SUPERVISION_PREVIEW_CASES.length, 4);
});
