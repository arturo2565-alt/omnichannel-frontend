import { apiFetchOrigin } from './apiClient.js';
import { calibrationDetailPath, calibrationListPath } from './calibrationPaths.js';
import { isAuthRejection } from './sessionQuery.js';

export { calibrationDetailPath, calibrationListPath };

function httpError(status) {
  const error = new Error(status === 403 ? 'No autorizado' : `HTTP ${status}`);
  error.status = status;
  return error;
}

export async function fetchCalibrationDocument(path) {
  const res = await apiFetchOrigin(path);
  if (res.status === 403) throw httpError(403);
  if (res.status === 404) return { status: 'missing', data: null };
  if (!res.ok) throw httpError(res.status);
  return { status: 'ok', data: await res.json() };
}

export async function loadCalibration(path) {
  try {
    const result = await fetchCalibrationDocument(path);
    if (result.status === 'missing') return { status: 'missing' };
    return { status: 'ok', data: result.data };
  } catch (error) {
    if (isAuthRejection(error)) throw error;
    return { status: 'error' };
  }
}

export async function loadCalibrationPhoto(caseId, photoId) {
  const res = await apiFetchOrigin(
    `/api/calibration/cases/${encodeURIComponent(caseId)}/photos/${encodeURIComponent(photoId)}`,
  );
  if (res.status === 403) throw httpError(403);
  if (!res.ok) return null;
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) return null;
  return URL.createObjectURL(await res.blob());
}
