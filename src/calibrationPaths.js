export function calibrationListPath(kind, filters = {}) {
  const params = new URLSearchParams();
  const q = String(filters.q ?? '').trim();
  if (q) params.set('q', q);
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (kind === 'cases' && filters.archive) params.set('archive', filters.archive);
  if (kind === 'opportunities' && filters.service) params.set('service', filters.service);
  if (kind === 'repair-work' && filters.evidence) params.set('evidence', filters.evidence);
  const suffix = params.toString();
  const base = kind === 'cases'
    ? '/api/calibration/cases'
    : kind === 'repairs'
      ? '/api/calibration/repairs'
      : kind === 'repair-work'
        ? '/api/calibration/repair-work'
        : '/api/calibration/opportunities';
  return `${base}${suffix ? `?${suffix}` : ''}`;
}

export function calibrationDetailPath(tab, id) {
  const encoded = encodeURIComponent(id);
  if (tab === 'visual') return `/api/calibration/cases/${encoded}`;
  if (tab === 'repair') return `/api/calibration/repairs/${encoded}`;
  return `/api/calibration/quotes/${encoded}`;
}
