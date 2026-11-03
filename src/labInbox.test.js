import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STAGING_TALLER_ID,
  buildLabTurnPayload,
  canStartLabTrial,
  isLabChannel,
  isStagingApiOrigin,
  labTurnPath,
} from './labInbox.js';

const owner = {
  email: 'dueno@ensayo.test',
  role: 'owner',
  tallerId: STAGING_TALLER_ID,
};
const staging = 'https://pegazuz-backend-staging-staging.up.railway.app';
const production = 'https://omnichannel-backend-production.up.railway.app';
const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const png = 'data:image/png;base64,iVBORw0KGgo=';

test('producción no habilita Nueva prueba', () => {
  assert.equal(isStagingApiOrigin(production), false);
  assert.equal(
    canStartLabTrial({ apiOrigin: production, user: owner, tallerId: owner.tallerId }),
    false,
  );
});

test('el dueño del taller de ensayo puede iniciar una prueba en staging', () => {
  assert.equal(
    canStartLabTrial({ apiOrigin: staging, user: owner, tallerId: owner.tallerId }),
    true,
  );
});

test('otro taller no puede usar el laboratorio', () => {
  assert.equal(
    canStartLabTrial({
      apiOrigin: staging,
      user: { ...owner, tallerId: '11111111-1111-4111-8111-111111111111' },
      tallerId: '11111111-1111-4111-8111-111111111111',
    }),
    false,
  );
});

test('un texto se envía como inbound del laboratorio', () => {
  const payload = buildLabTurnPayload({
    text: '¿Qué costo tiene reparar este golpe?',
    images: [],
    idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  });
  assert.deepEqual(Object.keys(payload), ['idempotencyKey', 'text']);
  assert.equal(payload.text, '¿Qué costo tiene reparar este golpe?');
  assert.equal(
    labTurnPath('b0e48790-e68c-44d1-93ab-777cbda4052d'),
    '/lab/conversations/b0e48790-e68c-44d1-93ab-777cbda4052d/turn',
  );
});

test('varias fotografías viajan en el mismo turno y sin Cloudinary', () => {
  const payload = buildLabTurnPayload({
    text: 'Mira estas fotos',
    images: [jpeg, png],
    idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  });
  assert.equal(payload.images.length, 2);
  assert.equal(JSON.stringify(payload).includes('cloudinary'), false);
  assert.equal(JSON.stringify(payload).includes('/upload'), false);
  assert.throws(
    () =>
      buildLabTurnPayload({
        images: ['https://res.cloudinary.com/demo/image/upload/a.jpg'],
        idempotencyKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      }),
    /archivo/,
  );
});

test('WhatsApp y Messenger no son canal de laboratorio', () => {
  assert.equal(isLabChannel('whatsapp'), false);
  assert.equal(isLabChannel('facebook'), false);
  assert.equal(isLabChannel('lab'), true);
});
