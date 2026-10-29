const OPERATION_ORDER = ['reparar', 'pintar', 'montar'];

export function sortOperations(operations) {
  const selected = new Set(operations || []);
  return OPERATION_ORDER.filter((operation) => selected.has(operation));
}

export function categoryFromStored(line) {
  if (line?.tariffKind === 'integral') return 'integrales';
  if (line?.tariffKind === 'montaje' || line?.tariffKind === 'montaje_pintura') return 'montaje';
  if (line?.tariffKind === 'reparacion_pintura') return 'piezas';
  const operations = String(line?.catalogOperations || '');
  if (line?.catalogPieceCode && operations.includes('montar') && !operations.includes('reparar')) {
    return 'montaje';
  }
  if (line?.catalogPieceCode && (line?.tariffKind === 'manual' || operations)) return 'piezas';
  return 'personalizado';
}

function sameOperations(left, right) {
  const a = sortOperations(left);
  const b = sortOperations(right);
  return a.length === b.length && a.every((operation, index) => operation === b[index]);
}

export function resolveCrmOffer(offer, line) {
  if (!offer || line.category === 'personalizado') {
    return {
      tariff: '',
      label: line.name || '',
      pesos: null,
      matrixRowId: null,
      reason: '',
      incompatible: false,
    };
  }
  const piece = (offer.pieces || []).find(
    (item) => item.code === line.pieceCode && (item.categories || []).includes(line.category),
  );
  if (!piece) {
    return {
      tariff: '',
      label: '',
      pesos: null,
      matrixRowId: null,
      reason: 'Elige una pieza del catálogo.',
      incompatible: false,
    };
  }
  const combo = (offer.combinations || []).find(
    (item) => item.category === line.category && sameOperations(item.operations, line.operations),
  );
  if (!combo || combo.tariff === 'incompatible') {
    return {
      tariff: '',
      label: '',
      pesos: null,
      matrixRowId: null,
      reason: combo?.reason || 'Esa combinación no está definida.',
      incompatible: true,
    };
  }
  const label = combo.label ? `${combo.label} · ${piece.label}` : piece.label;
  if (combo.tariff === 'pending') {
    return {
      tariff: '',
      label: '',
      pesos: null,
      matrixRowId: null,
      reason: combo.reason,
      incompatible: false,
    };
  }
  if (combo.tariff === 'manual') {
    return {
      tariff: 'manual',
      label,
      pesos: null,
      matrixRowId: null,
      reason: combo.reason,
      incompatible: false,
    };
  }
  const quote = piece.tariffs?.[combo.tariff];
  if (!quote || !(quote.pesos > 0)) {
    return {
      tariff: 'manual',
      label,
      pesos: null,
      matrixRowId: null,
      reason: 'No hay tarifa configurada para esta combinación. Captura el precio.',
      incompatible: false,
    };
  }
  return {
    tariff: combo.tariff,
    label,
    pesos: quote.pesos,
    matrixRowId: quote.matrixRowId || '',
    reason: 'Tarifa del catálogo. Puedes editar el precio.',
    incompatible: false,
  };
}

export function applyCrmSelection(line, offer, patch) {
  const structural = 'category' in patch || 'pieceCode' in patch || 'operations' in patch;
  const next = {
    ...line,
    ...patch,
    ...(structural ? { priceTouched: false, nameTouched: false } : {}),
  };
  if ('unitPrice' in patch) next.priceTouched = true;
  if ('name' in patch && !structural) next.nameTouched = true;
  if (next.category === 'personalizado') {
    return {
      ...next,
      pieceCode: '',
      operations: [],
      tariffKind: '',
      catalogMatrixRowId: '',
      catalogUnitPriceCents: null,
      incompatible: false,
      hint: '',
    };
  }
  const resolved = resolveCrmOffer(offer, next);
  return {
    ...next,
    incompatible: resolved.incompatible,
    hint: resolved.reason,
    tariffKind: resolved.tariff,
    catalogMatrixRowId: resolved.matrixRowId || '',
    catalogUnitPriceCents: resolved.pesos == null ? null : resolved.pesos * 100,
    name: next.nameTouched ? next.name : resolved.label || '',
    unitPrice: next.priceTouched
      ? next.unitPrice
      : resolved.pesos == null
        ? ''
        : String(resolved.pesos),
  };
}

export function linePayload(line) {
  const payload = {
    id: line.id,
    name: line.name.trim(),
    quantityHundredths: line.quantityHundredths,
    unitPriceCents: line.unitPriceCents,
  };
  if (!line.pieceCode || line.category === 'personalizado' || !line.tariffKind) return payload;
  return {
    ...payload,
    catalogPieceCode: line.pieceCode,
    tariffKind: line.tariffKind,
    catalogOperations: sortOperations(line.operations).join('+') || null,
    catalogMatrixRowId:
      line.tariffKind === 'manual' ? null : line.catalogMatrixRowId || null,
    catalogUnitPriceCents:
      line.tariffKind === 'manual' ? null : line.catalogUnitPriceCents,
  };
}

export function foldSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
