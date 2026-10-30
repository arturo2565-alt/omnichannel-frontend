import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PRODUCTION_API = 'omnichannel-backend-production.up.railway.app';

/** El bundle publicado tiene que hablar con el host de staging y con ningún otro API. */
export function assertStagingBundle(contents, env) {
  const pinned = String(env.STAGING_PUBLIC_HOST ?? '').trim().toLowerCase();
  const text = (Array.isArray(contents) ? contents : [contents]).join('\n');
  if (!pinned || pinned.includes('production')) {
    throw new Error('el host fijado no puede ser producción');
  }
  if (text.includes(PRODUCTION_API)) {
    throw new Error('el bundle incluye el API de producción');
  }
  if (!text.includes(pinned)) {
    throw new Error('el bundle no incluye el host de staging');
  }
}

function readBundle(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...readBundle(path));
      continue;
    }
    if (/\.(js|css|html)$/.test(entry)) out.push(readFileSync(path, 'utf8'));
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('falta el directorio del bundle');
    process.exit(1);
  }
  try {
    assertStagingBundle(readBundle(dir), process.env);
  } catch (err) {
    console.error(err instanceof Error ? err.message : 'el bundle no es de staging');
    process.exit(1);
  }
  console.log('OK: el bundle apunta al API de staging.');
}
