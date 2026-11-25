import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appointmentOrigin,
  canCall,
  canContactByWhatsApp,
  telHref,
  whatsappHref,
} from './appointmentChannel.js';

const FIXTURE_PHONE = '5512345678';

test('el origen sale del canal guardado y no del teléfono', () => {
  assert.deepEqual(
    appointmentOrigin({ conversationPlatform: 'lab', phone: FIXTURE_PHONE }),
    { id: 'lab', label: 'LAB' },
  );
  assert.deepEqual(
    appointmentOrigin({ conversationPlatform: 'whatsapp', phone: FIXTURE_PHONE }),
    { id: 'whatsapp', label: 'WhatsApp' },
  );
  assert.deepEqual(
    appointmentOrigin({ conversationPlatform: 'messenger' }),
    { id: 'messenger', label: 'Messenger' },
  );
  assert.deepEqual(
    appointmentOrigin({ conversationPlatform: 'instagram' }),
    { id: 'instagram', label: 'Instagram' },
  );
  assert.deepEqual(
    appointmentOrigin({ source: 'manual', phone: '5587654321' }),
    { id: 'manual', label: 'Manual' },
  );
  assert.deepEqual(
    appointmentOrigin({ phone: FIXTURE_PHONE }),
    { id: 'unknown', label: 'Desconocido' },
  );
  assert.deepEqual(
    appointmentOrigin({ conversationPlatform: 'crm' }),
    { id: 'other', label: 'Otro' },
  );
});

test('LAB no ofrece contacto externo y un canal real no bloquea un número de fixture', () => {
  const lab = { conversationPlatform: 'lab', phone: FIXTURE_PHONE };
  assert.equal(canContactByWhatsApp(lab), false);
  assert.equal(canCall(lab), false);
  assert.equal(appointmentOrigin(lab).label, 'LAB');

  const labOther = { conversationPlatform: 'lab', phone: '5587654321' };
  assert.equal(canContactByWhatsApp(labOther), false);
  assert.equal(canCall(labOther), false);

  const whatsapp = { conversationPlatform: 'whatsapp', phone: FIXTURE_PHONE };
  assert.equal(canContactByWhatsApp(whatsapp), true);
  assert.equal(canCall(whatsapp), true);
  assert.equal(whatsappHref(FIXTURE_PHONE), 'https://wa.me/525512345678');
  assert.equal(telHref(FIXTURE_PHONE), 'tel:5512345678');

  const messenger = { conversationPlatform: 'messenger', phone: '5587654321' };
  assert.equal(canContactByWhatsApp(messenger), true);
  assert.equal(canCall(messenger), true);
  assert.equal(appointmentOrigin(messenger).label, 'Messenger');

  const manual = { source: 'manual', phone: '5587654321' };
  assert.equal(canContactByWhatsApp(manual), true);
  assert.equal(canCall(manual), true);

  assert.equal(canContactByWhatsApp({ conversationPlatform: 'whatsapp' }), false);
  assert.equal(canCall({ conversationPlatform: 'whatsapp', phone: '123' }), false);
  assert.equal(telHref('123'), null);
  assert.equal(whatsappHref('123'), null);
  assert.equal(canContactByWhatsApp({ phone: FIXTURE_PHONE }), true);
  assert.equal(appointmentOrigin({ phone: FIXTURE_PHONE }).label, 'Desconocido');
});
