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
  if (!project.startsWith('prj_') || !production.startsWith('prj_')) {
    throw new Error('los identificadores de proyecto tienen que ser ids de Vercel');
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
  if (
    origin.includes('omnichannel-backend-production') ||
    base.includes('omnichannel-backend-production') ||
    host.includes('omnichannel-backend-production')
  ) {
    throw new Error('el origen no puede ser el API de producción');
  }
  if (!pinned || pinned.includes('production') || host.includes('production') || host !== pinned) {
    throw new Error('el origen no coincide con STAGING_PUBLIC_HOST');
  }
  if (!base.startsWith(origin)) {
    throw new Error('la base del API no cuelga del origen de staging');
  }
}

/** El preview solo se publica cuando el autodeploy nativo ya está apagado. */
export function assertStagingRelease(env) {
  assertStagingPreview(env);
  if (env.STAGING_NATIVE_DEPLOY !== 'off') {
    throw new Error('apaga el despliegue nativo de Vercel y fija STAGING_NATIVE_DEPLOY=off');
  }
}
