export function declaredAmount(value, validation) {
  if (validation === 'not_provided' || value == null) return null;
  return value;
}

export function groupRepairLines(lines = []) {
  return {
    parts: lines.filter((line) => line.role === 'part'),
    labor: lines.filter((line) => line.role === 'labor'),
  };
}

export function galleryMove(ids, currentId, step) {
  const index = ids.indexOf(currentId);
  if (index < 0) return ids[0] ?? null;
  const next = index + step;
  if (next < 0 || next >= ids.length) return currentId;
  return ids[next];
}

export function sumDeclared(lines = [], amountKey, validationKey) {
  const amounts = lines
    .map((line) => declaredAmount(line?.[amountKey], line?.[validationKey]))
    .filter((amount) => amount != null);
  if (amounts.length === 0) return null;
  return amounts.reduce((sum, amount) => sum + amount, 0);
}

export function listAmount(item, tab) {
  const value = tab === 'visual' ? item?.quotedTotalMxn : item?.quotedMxn;
  return Number.isInteger(value) ? value : null;
}
