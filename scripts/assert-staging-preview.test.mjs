import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertStagingPreview } from './assert-staging-preview.mjs';

const valid = {
  VERCEL_PROJECT_ID: 'prj_staging',
  PRODUCTION_VERCEL_PROJECT_ID: 'prj_production',
  STAGING_API_ORIGIN: 'https://api.staging.example.test',
  STAGING_API_BASE_URL: 'https://api.staging.example.test/webhook',
  STAGING_PUBLIC_HOST: 'api.staging.example.test',
};

test('acepta el proyecto y el host de staging', () => {
  assert.doesNotThrow(() => assertStagingPreview(valid));
});

test('rechaza el proyecto de producción y un host distinto', () => {
  assert.throws(
    () =>
      assertStagingPreview({
        ...valid,
        VERCEL_PROJECT_ID: 'prj_production',
      }),
    /coincide con producción/,
  );
  assert.throws(
    () =>
      assertStagingPreview({
        ...valid,
        STAGING_API_ORIGIN: 'https://api.production.example.test',
        STAGING_PUBLIC_HOST: 'api.production.example.test',
      }),
    /no coincide/,
  );
});
