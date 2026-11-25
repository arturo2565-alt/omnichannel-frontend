function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function appointmentOrigin(appointment) {
  const platform = String(appointment?.conversationPlatform ?? '').trim().toLowerCase();
  if (platform.includes('whatsapp')) return { id: 'whatsapp', label: 'WhatsApp' };
  if (platform.includes('messenger')) return { id: 'messenger', label: 'Messenger' };
  if (platform.includes('instagram')) return { id: 'instagram', label: 'Instagram' };
  if (platform === 'lab') return { id: 'lab', label: 'LAB' };
  if (platform === 'facebook') return { id: 'facebook', label: 'Facebook' };
  if (String(appointment?.source ?? '').trim().toLowerCase() === 'manual') {
    return { id: 'manual', label: 'Manual' };
  }
  if (platform) return { id: 'other', label: 'Otro' };
  return { id: 'unknown', label: 'Desconocido' };
}

/** Un teléfono usable tiene al menos 8 dígitos. El valor no decide el canal. */
export function telHref(phone) {
  const digits = digitsOnly(phone);
  if (digits.length < 8) return null;
  return `tel:${digits}`;
}

export function whatsappHref(phone) {
  const digits = digitsOnly(phone);
  if (digits.length < 8) return null;
  let n = digits;
  if (!(n.startsWith('52') && n.length >= 12) && n.length === 10) n = `52${n}`;
  return `https://wa.me/${n}`;
}

function allowsExternalContact(appointment) {
  return appointmentOrigin(appointment).id !== 'lab';
}

export function canCall(appointment) {
  return allowsExternalContact(appointment) && Boolean(telHref(appointment?.phone));
}

/** LAB no abre WhatsApp. En un canal real, el enlace depende del número, no de una lista de ensayo. */
export function canContactByWhatsApp(appointment) {
  return allowsExternalContact(appointment) && Boolean(whatsappHref(appointment?.phone));
}
