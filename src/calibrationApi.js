import { apiFetchOrigin } from './apiClient.js';
import { calibrationDetailPath, calibrationEvidencePath, calibrationListPath } from './calibrationPaths.js';
import { isAuthRejection } from './sessionQuery.js';

export { calibrationDetailPath, calibrationEvidencePath, calibrationListPath };

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

export async function confirmCalibrationSeverity({ subjectId, lineId, level }) {
  const res = await apiFetchOrigin('/api/calibration/severity', {
    method: 'POST',
    body: JSON.stringify({ subjectId, lineId, level, lineReviewed: true }),
  });
  if (!res.ok) throw httpError(res.status);
  return res.json();
}

async function rejectPreview(res) {
  let code = '';
  try {
    const body = await res.json();
    if (typeof body?.code === 'string') code = body.code;
    else if (typeof body?.message === 'string') code = body.message;
  } catch {
    code = '';
  }
  const error = httpError(res.status);
  error.code = code;
  throw error;
}

export async function holdEvidenceOrigin({ subjectId, imageBase64 }) {
  const res = await apiFetchOrigin('/api/calibration/evidence-previews', {
    method: 'POST',
    body: JSON.stringify({ subjectId, imageBase64, role: 'origin' }),
  });
  if (!res.ok) await rejectPreview(res);
  return res.json();
}

export async function holdEvidencePreview({ subjectId, imageBase64, provenanceId }) {
  const res = await apiFetchOrigin('/api/calibration/evidence-previews', {
    method: 'POST',
    body: JSON.stringify({
      subjectId,
      imageBase64,
      role: 'copy',
      ...(provenanceId ? { provenanceId } : {}),
    }),
  });
  if (!res.ok) await rejectPreview(res);
  return res.json();
}

export async function loadEvidencePreview(previewId) {
  const res = await apiFetchOrigin(`/api/calibration/evidence-previews/${encodeURIComponent(previewId)}`);
  if (!res.ok) throw httpError(res.status);
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) throw httpError(res.status || 502);
  return res.blob();
}

export async function confirmEvidenceArchive({ previewId, subjectId, sha256 }) {
  const res = await apiFetchOrigin(`/api/calibration/evidence-previews/${encodeURIComponent(previewId)}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ subjectId, sha256, visibleIdentifiersReviewed: true }),
  });
  if (!res.ok) throw httpError(res.status);
  return res.json();
}

export async function cancelEvidencePreview(previewId) {
  const res = await apiFetchOrigin(`/api/calibration/evidence-previews/${encodeURIComponent(previewId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!res.ok) throw httpError(res.status);
  return res.json();
}

export async function loadCalibrationEvidencePhoto(kind, quoteId, evidenceId) {
  const res = await apiFetchOrigin(calibrationEvidencePath(kind, quoteId, evidenceId));
  if (res.status === 403) throw httpError(403);
  if (!res.ok) return null;
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) return null;
  return URL.createObjectURL(await res.blob());
}
