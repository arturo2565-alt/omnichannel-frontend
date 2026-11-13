import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('el fallback de Vercel devuelve la aplicación sin reescribir archivos existentes', async () => {
  assert.deepEqual(Object.keys(config).sort(), ['$schema', 'rewrites']);
  assert.equal(config.rewrites.length, 1);
  assert.equal(config.rewrites[0].source, '/(.*)');
  assert.equal(config.rewrites[0].destination, '/index.html');
  assert.equal(config.rewrites[0].destination.startsWith('/'), true);
  assert.equal(config.builds, undefined);
  assert.equal(config.redirects, undefined);
  assert.equal(config.routes, undefined);

  const root = mkdtempSync(join(tmpdir(), 'pegazuz-spa-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>pegazuz-shell</title>');
  writeFileSync(join(root, 'assets', 'app.js'), 'window.pegazuzAsset=true');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = join(root, relative);
    const exists = file.startsWith(root) && existsFile(file);
    const target = exists ? file : join(root, 'index.html');
    const body = readFileSync(target);
    res.writeHead(200, {
      'content-type': target.endsWith('.js') ? 'application/javascript' : 'text/html',
    });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    for (const path of ['/admin/calibracion', '/inbox', '/login', '/dashboard', '/crm', '/calendar']) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') ?? '', /text\/html/);
      assert.match(await response.text(), /pegazuz-shell/);
    }
    const asset = await fetch(`http://127.0.0.1:${port}/assets/app.js`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type') ?? '', /javascript/);
    assert.equal(await asset.text(), 'window.pegazuzAsset=true');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});

function existsFile(path) {
  try {
    return readFileSync(path).byteLength >= 0;
  } catch {
    return false;
  }
}
