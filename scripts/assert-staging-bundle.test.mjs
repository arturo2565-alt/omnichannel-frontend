import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertStagingBundle } from './assert-staging-bundle.mjs';
import { assertStagingRelease } from './assert-staging-preview.mjs';

const env = { STAGING_PUBLIC_HOST: 'api.staging.example.test' };

test('acepta un bundle que solo nombra el host de staging', () => {
  assert.doesNotThrow(() =>
    assertStagingBundle(['const origin = "https://api.staging.example.test"'], env),
  );
});

test('rechaza el API de producción y un host ausente', () => {
  assert.throws(
    () =>
      assertStagingBundle(
        ['https://omnichannel-backend-production.up.railway.app/webhook'],
        env,
      ),
    /API de producción/,
  );
  assert.throws(() => assertStagingBundle(['https://otro.example.test'], env), /no incluye/);
  assert.throws(
    () => assertStagingBundle(['https://api.production.example.test'], { STAGING_PUBLIC_HOST: 'api.production.example.test' }),
    /no puede ser producción/,
  );
});

test('la publicación exige el autodeploy nativo apagado', () => {
  const release = {
    VERCEL_PROJECT_ID: 'prj_staging',
    PRODUCTION_VERCEL_PROJECT_ID: 'prj_production',
    STAGING_API_ORIGIN: 'https://api.staging.example.test',
    STAGING_API_BASE_URL: 'https://api.staging.example.test/webhook',
    STAGING_PUBLIC_HOST: 'api.staging.example.test',
    STAGING_NATIVE_DEPLOY: 'off',
  };
  assert.doesNotThrow(() => assertStagingRelease(release));
  assert.throws(
    () => assertStagingRelease({ ...release, STAGING_NATIVE_DEPLOY: '' }),
    /despliegue nativo/,
  );
  assert.throws(
    () => assertStagingRelease({ ...release, STAGING_NATIVE_DEPLOY: 'OFF' }),
    /despliegue nativo/,
  );
  assert.throws(
    () => assertStagingRelease({ ...release, STAGING_NATIVE_DEPLOY: 'off ' }),
    /despliegue nativo/,
  );
  assert.throws(
    () => assertStagingRelease({ ...release, VERCEL_PROJECT_ID: 'pegazuz-frontend-staging' }),
    /ids de Vercel/,
  );
  assert.throws(
    () =>
      assertStagingRelease({
        ...release,
        STAGING_API_ORIGIN: 'https://omnichannel-backend-production.up.railway.app',
        STAGING_API_BASE_URL: 'https://omnichannel-backend-production.up.railway.app/webhook',
        STAGING_PUBLIC_HOST: 'omnichannel-backend-production.up.railway.app',
      }),
    /producción/,
  );
});

test('el workflow de preview no convive con el despliegue de Git', () => {
  const workflow = readFileSync(new URL('../.github/workflows/staging-preview.yml', import.meta.url), 'utf8');
  expectOne(workflow, 'vercel deploy --prod');
  assert.equal(workflow.includes('git.deploymentEnabled'), false);
  assert.match(workflow, /vars\.STAGING_NATIVE_DEPLOY == 'off'/);
  assert.match(workflow, /vars\.STAGING_DEPLOY_ENABLED == 'true'/);
  assert.match(workflow, /--project "\$VERCEL_PROJECT_ID"/);
  assert.match(workflow, /rm -rf \.vercel/);
  assert.equal(workflow.includes('--token'), false);
  assert.match(workflow, /assert-staging-bundle.mjs/);
  assert.equal(workflow.includes('omnichannel-backend-production'), false);
});

function expectOne(text, needle) {
  const hits = text.split(needle).length - 1;
  assert.equal(hits, 1, needle);
}
