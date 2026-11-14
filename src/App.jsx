import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import ChatView from './ChatView';
import { API_BASE_URL, API_ORIGIN_URL } from './apiConfig.js';
import { apiFetchWebhook, createLabConversation, expireAuthSession, parseApiError, sendAgentMessageRequest, sendLabTurn } from './apiClient.js';
import { buildLabTurnPayload, canStartLabTrial, isLabChannel } from './labInbox.js';
import { connectWorkshopSocket } from './realtimeSocket.js';
import { useAuth } from './AuthContext.jsx';
import { useSessionCacheStatus } from './sessionCacheStatus.js';
import {
  applyConversationPatch,
  applyIncomingMessage,
  chronologicalMessages,
  hasSessionScope,
  nextSocketConnect,
  readWorkshopResponse,
  sessionScope,
  syncAfterOutboundMessage,
  syncAfterSocketReconnect,
  workshopKey,
} from './sessionQuery.js';

/** Convierte el texto único de la IA en varias opciones para QuickReplies */
function suggestionLinesFromAi(text) {
  if (!text?.trim()) return [];
  const raw = text.trim();
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(\d+[.)]|[-•*])\s+/, '').trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;
  return [raw];
}

function App() {
  const [searchParams] = useSearchParams();
  const { taller, user } = useAuth();
  const { rejected } = useSessionCacheStatus();
  const queryClient = useQueryClient();
  const scope = sessionScope(user, taller);
  const userId = scope.userId;
  const tallerId = scope.tallerId;
  const authTallerId = tallerId;
  const queriesEnabled = hasSessionScope(scope) && !rejected;

  const [selectedConvId, setSelectedConvId] = useState(null);
  const [reply, setReply] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);

  // --- 🌟 ESTADOS MULTIMEDIA 🌟 ---
  const [selectedFile, setSelectedFile] = useState(null); 
  const [filePreviewUrl, setFilePreviewUrl] = useState(null); 
  const [isSending, setIsSending] = useState(false);
  const [deleteToast, setDeleteToast] = useState('');
  const [labTrialBusy, setLabTrialBusy] = useState(false);
  const [labProcessingId, setLabProcessingId] = useState('');
  const labProcessingRef = useRef('');
  labProcessingRef.current = labProcessingId;
  const labTrialAvailable = canStartLabTrial({
    apiOrigin: API_ORIGIN_URL,
    user,
    tallerId: authTallerId,
  });

  const conversationKey = workshopKey(scope, 'conversations');
  const messageKey = workshopKey(scope, 'messages', selectedConvId ?? '');

  const conversationsQuery = useQuery({
    queryKey: conversationKey,
    enabled: queriesEnabled,
    queryFn: async () => {
      const response = await apiFetchWebhook('/conversations');
      const data = await readWorkshopResponse(response);
      return Array.isArray(data) ? data : [];
    },
  });
  const messagesQuery = useQuery({
    queryKey: messageKey,
    enabled: queriesEnabled && Boolean(selectedConvId),
    queryFn: async () => {
      const response = await apiFetchWebhook(`/messages/${selectedConvId}`);
      const data = await readWorkshopResponse(response);
      return chronologicalMessages(data);
    },
  });

  const contacts = rejected ? [] : (conversationsQuery.data ?? []);
  const messages = rejected ? [] : (messagesQuery.data ?? []);
  const refreshConversations = () => {
    if (!queriesEnabled) return Promise.resolve();
    return queryClient.invalidateQueries({ queryKey: conversationKey });
  };

  // --- EFECTOS ---
  useEffect(() => {
    const socket = connectWorkshopSocket({
      onUnauthorized: () => expireAuthSession(),
    });
    if (!socket) return undefined;
    socketRef.current = socket;
    const activeScope = { userId, tallerId };
    let connectState = { connectedBefore: false };
    const onConnect = () => {
      setIsConnected(true);
      connectState = nextSocketConnect(connectState);
      if (connectState.shouldSync && queriesEnabled) syncAfterSocketReconnect(queryClient, activeScope);
    };
    const onDisconnect = () => setIsConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      setIsConnected(false);
    };
  }, [queriesEnabled, queryClient, userId, tallerId]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !queriesEnabled) return undefined;
    const activeScope = { userId, tallerId };
    const listKey = workshopKey(activeScope, 'conversations');
    const patchMessages = (updater) => {
      if (!selectedConvId) return;
      queryClient.setQueryData(workshopKey(activeScope, 'messages', selectedConvId), (current) => {
        const list = Array.isArray(current) ? current : [];
        return updater(list);
      });
    };
    const onNewMessage = (msg) => {
      const incomingId = msg.conversationId || msg.conversation?.id;
      if (
        String(msg?.direction ?? '').toLowerCase() === 'outbound' &&
        incomingId &&
        incomingId === labProcessingRef.current
      ) {
        setLabProcessingId('');
      }
      applyIncomingMessage(queryClient, activeScope, msg);
    };
    const onAiSuggestion = (data) => {
      if (data.conversationId === selectedConvId) { setAiSuggestion(data.suggestion); }
    };
    const mergeQuoteIntoMessages = (payload) => {
      applyConversationPatch(queryClient, activeScope, payload.conversationId, {
        ...(payload.isAutoPilotActive !== undefined
          ? { isAutoPilotActive: payload.isAutoPilotActive }
          : {}),
      });
      if (payload.conversationId !== selectedConvId) return;
      patchMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId
            ? {
                ...m,
                damageAnalysis: payload.damageAnalysis ?? m.damageAnalysis,
                draftQuote: payload.draftQuote ?? m.draftQuote,
              }
            : m,
        ),
      );
    };
    const onConversationLeadUpdated = (payload) => {
      const known = (queryClient.getQueryData(listKey) ?? []).some((item) => item.id === payload.conversationId);
      if (!known) {
        void queryClient.invalidateQueries({ queryKey: listKey });
        return;
      }
      applyConversationPatch(queryClient, activeScope, payload.conversationId, {
        ...(payload.status != null ? { status: payload.status } : {}),
        ...(payload.lastMessageAt != null ? { lastMessageAt: payload.lastMessageAt } : {}),
        ...(payload.lastMessage != null ? { lastMessage: payload.lastMessage } : {}),
        ...(payload.isAutoPilotActive !== undefined
          ? { isAutoPilotActive: payload.isAutoPilotActive }
          : {}),
      });
    };
    const onPeritajeAwaitingVehicle = (payload) => {
      applyConversationPatch(queryClient, activeScope, payload.conversationId, {
        ...(payload.isAutoPilotActive !== undefined
          ? { isAutoPilotActive: payload.isAutoPilotActive }
          : {}),
      });
      if (payload.conversationId !== selectedConvId) return;
      patchMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId
            ? {
                ...m,
                damageAnalysis: payload.damageAnalysis ?? m.damageAnalysis,
                draftQuote: null,
              }
            : m,
        ),
      );
    };
    socket.on('newMessage', onNewMessage);
    socket.on('aiSuggestion', onAiSuggestion);
    socket.on('draftQuoteReady', mergeQuoteIntoMessages);
    socket.on('imageDamageAnalysis', mergeQuoteIntoMessages);
    socket.on('draftPeritajeAwaitingVehicle', onPeritajeAwaitingVehicle);
    socket.on('conversationLeadUpdated', onConversationLeadUpdated);
    return () => {
      socket.off('newMessage', onNewMessage);
      socket.off('aiSuggestion', onAiSuggestion);
      socket.off('draftQuoteReady', mergeQuoteIntoMessages);
      socket.off('imageDamageAnalysis', mergeQuoteIntoMessages);
      socket.off('draftPeritajeAwaitingVehicle', onPeritajeAwaitingVehicle);
      socket.off('conversationLeadUpdated', onConversationLeadUpdated);
    };
  }, [selectedConvId, queriesEnabled, queryClient, userId, tallerId]);

  useEffect(() => {
    const cid = searchParams.get('conversation');
    if (cid && cid.trim()) {
      setSelectedConvId(cid.trim());
    }
  }, [searchParams]);

  // --- ACCIONES DE MULTIMEDIA ---
  const handleFileSelect = (file) => {
    if (!file) return;
    setSelectedFile(file);
    const localUrl = URL.createObjectURL(file);
    setFilePreviewUrl(localUrl);
    setReply(''); 
    setAiSuggestion(null);
  };

  const filePreviewUrlRef = useRef(null);
  filePreviewUrlRef.current = filePreviewUrl;

  const handleClearFile = () => {
    setSelectedFile(null);
    if (filePreviewUrlRef.current) {
      URL.revokeObjectURL(filePreviewUrlRef.current);
      filePreviewUrlRef.current = null;
    }
    setFilePreviewUrl(null);
  };

  useEffect(() => {
    setAiSuggestion(null);
    setSelectedFile(null);
    if (filePreviewUrlRef.current) {
      URL.revokeObjectURL(filePreviewUrlRef.current);
      filePreviewUrlRef.current = null;
      setFilePreviewUrl(null);
    }
  }, [selectedConvId]);

  // --- 🌟 FUNCIÓN MAESTRA DE ENVÍO ACTUALIZADA 🌟 ---
  /** @param {string|undefined} textOverride Si se pasa, se envía ese texto (p. ej. cotización) en lugar de `reply`. */
  /**
   * @param {object} [sendOptions]
   * @param {'cotizado'} [sendOptions.conversationLeadStatus] Marca el lead al enviar cotización final.
   */
  const sendMessage = async (textOverride, sendOptions = {}) => {
    const textFromInput = reply.trim();
    /** `.trim()` solo quita espacios al inicio/final; preserva `\n` internos (p. ej. plantilla de cotización). */
    const textFromOverride =
      textOverride !== undefined && textOverride !== null
        ? String(textOverride).trim()
        : '';
    const useOverride = textFromOverride.length > 0;
    const textContent = useOverride ? textFromOverride : textFromInput;

    const currentConv = contacts.find(c => c.id === selectedConvId);
    if (isLabChannel(currentConv?.platform)) {
      window.alert('Esta prueba no envía mensajes reales. Usa «Enviar como cliente».');
      return;
    }
    if ((!textContent && !selectedFile) || !selectedConvId || isSending) return;
    if (!authTallerId) {
      alert('Sesión sin taller asignado. Cierra sesión e inicia de nuevo.');
      return;
    }

    setIsSending(true);
    let finalContent = textContent;

    try {
      // --- BLOQUE DE SUBIDA CON LOG DE ERRORES ---
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile); 

        console.log("Subiendo imagen a:", `${API_BASE_URL}/upload`);
        
        const uploadResp = await apiFetchWebhook('/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (!uploadResp.ok) {
          const errorData = await uploadResp.json().catch(() => ({}));
          console.error("Detalle del error backend:", errorData);
          throw new Error(`Fallo la subida: ${uploadResp.status}`);
        }
        
        const { url } = await uploadResp.json();
        finalContent = url; 
        console.log("Imagen subida con éxito:", url);
      }

      // --- ENVÍO FINAL DEL MENSAJE ---
      await sendAgentMessageRequest({
        message: finalContent,
        platform: currentConv?.platform || 'web-dashboard',
        user: user?.email ? `Agente (${user.email})` : 'Agente',
        conversationId: selectedConvId,
        tallerId: authTallerId,
        ...(sendOptions?.conversationLeadStatus === 'cotizado'
          ? { conversationLeadStatus: 'cotizado' }
          : {}),
      });

      if (!useOverride) setReply("");
      handleClearFile();
      setAiSuggestion(null);
      syncAfterOutboundMessage(queryClient, scope, selectedConvId, {
        affectsDashboard: sendOptions?.conversationLeadStatus === 'cotizado',
      });

    } catch (error) {
      console.error("Error crítico al enviar:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  // --- ACCIONES DE IA ---
  const handleGetAiSuggestion = async () => {
    if (!selectedConvId) return;
    setIsAiLoading(true); setAiSuggestion(null);
    try {
      const response = await apiFetchWebhook(`/ai-suggest/${selectedConvId}`, {
        method: 'POST',
      });
      const data = await response.json();
      setAiSuggestion(data.suggestion);
    } catch (error) { console.error("Error IA:", error); }
    finally { setIsAiLoading(false); }
  };

  const selectedUserName = contacts.find(c => c.id === selectedConvId)?.contactName || "Usuario";

  const quickReplySuggestions = useMemo(
    () => suggestionLinesFromAi(aiSuggestion),
    [aiSuggestion],
  );

  const handleDeleteConversation = async () => {
    if (!selectedConvId) return;
    const confirmed = window.confirm(
      '¿Estás seguro de que deseas eliminar esta conversación? Esta acción borrará todo el historial, citas y cotizaciones de forma permanente.',
    );
    if (!confirmed) return;

    try {
      const res = await apiFetchWebhook(`/conversations/${selectedConvId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      queryClient.setQueryData(conversationKey, (prev) => (
        Array.isArray(prev) ? prev.filter((c) => c.id !== selectedConvId) : prev
      ));
      queryClient.removeQueries({ queryKey: messageKey });
      setSelectedConvId(null);
      setAiSuggestion(null);
      handleClearFile();
      setDeleteToast('Conversación eliminada correctamente');
      setTimeout(() => setDeleteToast(null), 4500);
    } catch (error) {
      console.error('Delete conversation:', error);
      window.alert(
        error?.message ?? 'No se pudo eliminar la conversación',
      );
    }
  };

  const handleCreateLabTrial = async () => {
    if (!labTrialAvailable || labTrialBusy) return;
    setLabTrialBusy(true);
    try {
      const created = await createLabConversation();
      const id = String(created?.id ?? '').trim();
      if (!id) throw new Error('No se pudo abrir la prueba.');
      const optimistic = {
        id,
        platform: created.platform || 'lab',
        contactName: 'Cliente de laboratorio',
        status: 'nuevo',
        lastMessage: '',
        direction: 'inbound',
      };
      queryClient.setQueryData(conversationKey, (prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return [optimistic, ...list.filter((item) => item.id !== id)];
      });
      setSelectedConvId(id);
      queryClient.setQueryData(workshopKey(scope, 'messages', id), []);
      await queryClient.refetchQueries({ queryKey: conversationKey });
      queryClient.setQueryData(conversationKey, (prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.some((item) => item.id === id) ? list : [optimistic, ...list];
      });
    } catch (error) {
      window.alert(error?.message || 'No se pudo crear la prueba.');
    } finally {
      setLabTrialBusy(false);
    }
  };

  const handleSendAsClient = async ({ text, images }) => {
    const current = contacts.find((item) => item.id === selectedConvId);
    if (!selectedConvId || !isLabChannel(current?.platform)) {
      throw new Error('Esta conversación no es una prueba.');
    }
    const payload = buildLabTurnPayload({
      text,
      images,
      idempotencyKey: crypto.randomUUID(),
    });
    setLabProcessingId(selectedConvId);
    try {
      await sendLabTurn(selectedConvId, payload);
      await queryClient.refetchQueries({ queryKey: messageKey });
      await queryClient.refetchQueries({ queryKey: conversationKey });
    } catch (error) {
      setLabProcessingId('');
      throw error;
    }
  };

  useEffect(() => {
    if (!labProcessingId) return undefined;
    const timer = setTimeout(() => setLabProcessingId(''), 40_000);
    return () => clearTimeout(timer);
  }, [labProcessingId]);

  const handleDraftQuotePatched = ({ messageId, draftQuote, damageAnalysis }) => {
    if (!messageId) return;
    queryClient.setQueryData(messageKey, (prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.map((m) =>
        m.id === messageId
          ? {
              ...m,
              ...(draftQuote !== undefined ? { draftQuote } : {}),
              ...(damageAnalysis !== undefined ? { damageAnalysis } : {}),
            }
          : m,
      );
    });
  };

  const handleLeadStatusChange = (conversationId, patch) => {
    applyConversationPatch(queryClient, scope, conversationId, {
      ...(patch?.status ? { status: patch.status } : {}),
      ...(patch?.isAutoPilotActive !== undefined
        ? { isAutoPilotActive: patch.isAutoPilotActive }
        : {}),
    });
  };

  const handleClienteEsperandoAtendido = (conversationId) => {
    applyConversationPatch(queryClient, scope, conversationId, {
      clienteEsperandoAfuera: false,
    });
  };

  return (
    <>
    {deleteToast ? (
      <div
        role="status"
        className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg ring-1 ring-emerald-700/30"
      >
        {deleteToast}
      </div>
    ) : null}
    <ChatView 
      contacts={contacts}
      selectedConvId={selectedConvId}
      setSelectedConvId={setSelectedConvId}
      selectedUserName={selectedUserName}
      messages={messages}
      reply={reply}
      setReply={setReply}
      onSendMessage={() => sendMessage()}
      onSendQuoteText={(text, opts) => sendMessage(text, opts ?? {})}
      contactsPending={conversationsQuery.isPending}
      onRefresh={refreshConversations}
      quickReplySuggestions={quickReplySuggestions}
      isAiLoading={isAiLoading}
      onGetAiSuggestion={handleGetAiSuggestion}
      isConnected={isConnected}
      filePreviewUrl={filePreviewUrl}
      onFileSelect={handleFileSelect}
      onClearFile={handleClearFile}
      isSending={isSending}
      apiBaseUrl={API_BASE_URL}
      onDraftQuotePatched={handleDraftQuotePatched}
      onDeleteConversation={handleDeleteConversation}
      onClienteEsperandoAtendido={handleClienteEsperandoAtendido}
      onLeadStatusChange={handleLeadStatusChange}
      labTrialAvailable={labTrialAvailable}
      labTrialBusy={labTrialBusy}
      onCreateLabTrial={handleCreateLabTrial}
      onSendAsClient={handleSendAsClient}
      labProcessing={Boolean(selectedConvId) && labProcessingId === selectedConvId}
    />
    </>
  );
}

export default App;