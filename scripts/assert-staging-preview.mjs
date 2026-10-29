/** El preview solo puede apuntar al host público de staging. */
export function assertStagingPreview(env) {
  const project = String(env.VERCEL_PROJECT_ID ?? '').trim();
  const production = String(env.PRODUCTION_VERCEL_PROJECT_ID ?? '').trim();
  const origin = String(env.STAGING_API_ORIGIN ?? '').trim().replace(/\/$/, '');
  const base = String(env.STAGING_API_BASE_URL ?? '').trim().replace(/\/$/, '');
  const pinned = String(env.STAGING_PUBLIC_HOST ?? '').trim().toLowerCase();

  if (!project || !production) {
    throw new Error('faltan los identificadores de proyecto');
  }
  if (project === production) {
    throw new Error('el proyecto de staging coincide con producción');
  }

  let host = '';
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    throw new Error('el origen de staging no es una URL');
  }
  if (!pinned || pinned.includes('production') || host.includes('production') || host !== pinned) {
    throw new Error('el origen no coincide con STAGING_PUBLIC_HOST');
  }
  if (!base.startsWith(origin)) {
    throw new Error('la base del API no cuelga del origen de staging');
  }
}
