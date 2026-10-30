import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const workflows = join(import.meta.dirname, '../.github/workflows');

test('las actions del frontend declaran el runtime Node 24 y la app sigue en Node 22', () => {
  for (const name of ['crm-verify.yml', 'staging-preview.yml']) {
    const text = readFileSync(join(workflows, name), 'utf8');
    assert.match(text, /actions\/checkout@v5/);
    assert.match(text, /actions\/setup-node@v5/);
    assert.match(text, /node-version: 22/);
    assert.doesNotMatch(text, /actions\/checkout@v4/);
    assert.doesNotMatch(text, /actions\/setup-node@v4/);
  }
  const preview = readFileSync(join(workflows, 'staging-preview.yml'), 'utf8');
  assert.match(preview, /vars\.STAGING_DEPLOY_ENABLED == 'true'/);
  assert.match(preview, /vars\.STAGING_NATIVE_DEPLOY == 'off'/);
  assert.equal((preview.match(/vercel deploy --prod/g) || []).length, 1);
});
