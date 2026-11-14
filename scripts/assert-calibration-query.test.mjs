import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('la calibración queda protegida y fuera de la barra inferior', () => {
  const main = read('../src/main.jsx');
  const rail = read('../src/OmnichannelLeftRail.jsx');
  const page = read('../src/CalibrationPage.jsx');
  const api = read('../src/calibrationApi.js');
  const bottom = rail.slice(rail.indexOf('lg:hidden'));

  assert.match(main, /path="\/admin\/calibracion"[\s\S]*<ProtectedRoute>[\s\S]*<CalibrationPage \/>/);
  assert.match(rail, /to="\/admin\/calibracion"[\s\S]*title="Calibración"/);
  assert.doesNotMatch(bottom, /calibracion/);
  assert.match(page, /Centro de Calibración/);
  assert.match(page, /Reparaciones/);
  assert.match(page, /Evidencia textual/);
  assert.match(page, /Sin fotografías/);
  assert.match(page, /Total cotizado/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /object-contain/);
  assert.match(page, /flex-wrap/);
  assert.match(page, /overflow-x-hidden/);
  assert.match(page, /Historial de revisiones/);
  assert.doesNotMatch(page, /cloudinary|localStorage|indexedDB|GITHUB|ghs_/);
  assert.match(page, /loadCalibrationPhoto/);
  assert.match(page, /staleTime: Infinity/);
  assert.match(page, /calibrationRefreshIndicator/);
  assert.match(page, /Puede estar desactualizada/);
  assert.doesNotMatch(page, /Esta consulta aún no se confirma/);
  assert.doesNotMatch(page, /localStorage|indexedDB/);
  assert.doesNotMatch(api, /CLOUDINARY|GITHUB|ghs_|localStorage|indexedDB/);
  assert.doesNotMatch(page, /res\.cloudinary\.com/);
});
