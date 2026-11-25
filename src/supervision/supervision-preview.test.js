import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SUPERVISION_PREVIEW_CASES } from './supervision-preview-fixtures.js';

test('la vista de inspección no entra en la bandeja', () => {
  const chat = readFileSync(new URL('../ChatView.jsx', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
  assert.equal(chat.includes('supervision-preview'), false);
  assert.equal(chat.includes('SUPERVISION_PREVIEW_CASES'), false);
  const marker = '{hasPanelQuote && selectedConvId ? renderQuoteActionButtons() : null}';
  const first = chat.indexOf(marker);
  const second = chat.indexOf(marker, first + marker.length);
  assert.ok(first > 0);
  assert.ok(second > first);
  assert.equal(chat.indexOf(marker, second + marker.length), -1);
  for (const index of [first, second]) {
    const follow = chat.slice(index, index + 220);
    const details = follow.indexOf('</details>');
    const panel = follow.indexOf('</AgentSupervisionPanel>');
    assert.ok(details > 0);
    assert.ok(panel === -1 || details < panel);
  }
  assert.match(main, /import\.meta\.env\.DEV/);
  assert.equal(SUPERVISION_PREVIEW_CASES.length, 4);
});
