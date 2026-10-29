import { io } from 'socket.io-client';
import { API_ORIGIN_URL } from './apiConfig.js';
import { getAccessToken } from './authStorage.js';

/**
 * Socket de taller. El JWT va en handshake.auth y se vuelve a leer en cada
 * reconexión. No se envía tallerId: la sala la decide el backend.
 */
export function connectWorkshopSocket({ onUnauthorized } = {}) {
  const current = String(getAccessToken() ?? '').trim();
  if (!current) {
    onUnauthorized?.();
    return null;
  }
  const socket = io(API_ORIGIN_URL, {
    transports: ['websocket'],
    reconnection: true,
    auth: (callback) => {
      callback({ token: String(getAccessToken() ?? '').trim() });
    },
  });
  socket.on('connect_error', (err) => {
    const message = String(err?.message ?? '');
    if (message === 'unauthorized' || message.includes('unauthorized')) {
      socket.disconnect();
      onUnauthorized?.();
    }
  });
  return socket;
}
