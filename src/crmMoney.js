/** Misma regla que el backend: (cantidad en centésimas × precio en centavos + 50) / 100. */
export function lineSubtotalCents(quantityHundredths, unitPriceCents) {
  return Math.floor((quantityHundredths * unitPriceCents + 50) / 100);
}

export function parseDecimalToScaled(text) {
  const raw = String(text ?? '').trim().replace(/[$,\s]/g, '');
  if (!raw || !/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const [whole, frac = ''] = raw.split('.');
  return Number(whole) * 100 + Number((`${frac}00`).slice(0, 2));
}

export function formatCents(cents) {
  const abs = Math.trunc(Math.abs(Number(cents) || 0));
  const pesos = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  const grouped = new Intl.NumberFormat('es-MX').format(pesos);
  return `$${grouped}.${frac}`;
}

export function formatHundredths(value) {
  const n = Math.trunc(Number(value) || 0);
  const whole = Math.trunc(n / 100);
  const frac = String(n % 100).padStart(2, '0');
  return frac === '00' ? String(whole) : `${whole}.${frac}`;
}

export function blankServiceLine() {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id, name: '', quantity: '1', unitPrice: '' };
}
