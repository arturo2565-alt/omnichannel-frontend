import { apiFetchOrigin } from './apiClient.js';

export async function loadCalibration(path) {
  try {
    const res = await apiFetchOrigin(path);
    if (res.status === 403) return { status: 'forbidden' };
    if (res.status === 404) return { status: 'missing' };
    if (!res.ok) return { status: 'error' };
    return { status: 'ok', data: await res.json() };
  } catch {
    return { status: 'error' };
  }
}

export async function loadCalibrationPhoto(caseId, photoId) {
  try {
    const res = await apiFetchOrigin(
      `/api/calibration/cases/${encodeURIComponent(caseId)}/photos/${encodeURIComponent(photoId)}`,
    );
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return null;
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
}
