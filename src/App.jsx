import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import ChatView from './ChatView';
import { API_BASE_URL } from './apiConfig.js';
import { apiFetchWebhook, sendAgentMessageRequest } from './apiClient.js';
import { useAuth } from './AuthContext.jsx';

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
const socket = io('https://omnichannel-backend-production.up.railway.app', { 
  transports: ['websocket'], 
  upgrade: false 
});

function App() {
  const [searchParams] = useSearchParams();
  const { taller, user } = useAuth();
  const authTallerId = taller?.id ?? user?.tallerId ?? '';

  // --- ESTADOS ---
  const [contacts, setContacts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [reply, setReply] = useState("");
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);

  // --- 🌟 ESTADOS MULTIMEDIA 🌟 ---
  const [selectedFile, setSelectedFile] = useState(null); 
  const [filePreviewUrl, setFilePreviewUrl] = useState(null); 
  const [isSending, setIsSending] = useState(false);
  const [deleteToast, setDeleteToast] = useState('');

  // --- LÓGICA DE CARGA ---
  const fetchConversations = async () => {
    try {
      const response = await apiFetchWebhook('/conversations');
      if (!response.ok) {
        console.error("Error conversaciones HTTP:", response.status);
        setContacts([]);
        return;
      }
      const data = await response.json();
      setContacts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error conversaciones:", error);
      setContacts([]);
    }
  };

  const fetchMessagesForConv = async (convId) => {
    if (!convId) return;
    try {
      const response = await apiFetchWebhook(`/messages/${convId}`);
      if (!response.ok) {
        console.error("Error mensajes HTTP:", response.status);
        setMessages([]);
        return;
      }
      const data = await response.json();
      const list = Array.isArray(data) ? data : [];
      setMessages([...list].reverse());
    } catch (error) {
      console.error("Error mensajes:", error);
      setMessages([]);
    }
  };

  // --- EFECTOS ---
  useEffect(() => {
    fetchConversations();
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('newMessage', (msg) => {
      if (msg.conversationId === selectedConvId || msg.conversation?.id === selectedConvId) {
        setMessages((prev) => [...prev, msg]);
      }
      fetchConversations();
    });
    socket.on('aiSuggestion', (data) => {
      if (data.conversationId === selectedConvId) { setAiSuggestion(data.suggestion); }
    });
    const mergeQuoteIntoMessages = (payload) => {
      setContacts((prev) =>
        prev.map((c) =>
          c.id === payload.conversationId
            ? {
                ...c,
                ...(payload.isAutoPilotActive !== undefined
                  ? { isAutoPilotActive: payload.isAutoPilotActive }
                  : {}),
              }
            : c,
        ),
      );
      if (payload.conversationId !== selectedConvId) {
        fetchConversations();
        return;
      }
      setMessages((prev) =>
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
      fetchConversations();
    };
    const onConversationLeadUpdated = (payload) => {
      setContacts((prev) => {
        const idx = prev.findIndex((c) => c.id === payload.conversationId);
        if (idx === -1) {
          fetchConversations();
          return prev;
        }
        return prev.map((c) =>
          c.id === payload.conversationId
            ? {
                ...c,
                status: payload.status ?? c.status,
                ...(payload.lastMessageAt != null
                  ? { lastMessageAt: payload.lastMessageAt }
                  : {}),
                ...(payload.lastMessage != null
                  ? { lastMessage: payload.lastMessage }
                  : {}),
                ...(payload.isAutoPilotActive !== undefined
                  ? { isAutoPilotActive: payload.isAutoPilotActive }
                  : {}),
              }
            : c,
        );
      });
    };
    const onPeritajeAwaitingVehicle = (payload) => {
      setContacts((prev) =>
        prev.map((c) =>
          c.id === payload.conversationId
            ? {
                ...c,
                ...(payload.isAutoPilotActive !== undefined
                  ? { isAutoPilotActive: payload.isAutoPilotActive }
                  : {}),
              }
            : c,
        ),
      );
      if (payload.conversationId !== selectedConvId) {
        fetchConversations();
        return;
      }
      setMessages((prev) =>
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
      fetchConversations();
    };
    const onCotizacionActualizada = (payload) => {
      mergeQuoteIntoMessages(payload);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('omnichannel:cotizacionActualizada', { detail: payload }),
        );
      }
    };
    socket.on('draftQuoteReady', mergeQuoteIntoMessages);
    socket.on('cotizacionActualizada', onCotizacionActualizada);
    socket.on('imageDamageAnalysis', mergeQuoteIntoMessages);
    socket.on('draftPeritajeAwaitingVehicle', onPeritajeAwaitingVehicle);
    socket.on('conversationLeadUpdated', onConversationLeadUpdated);
    return () => { 
      socket.off('connect'); 
      socket.off('disconnect'); 
      socket.off('newMessage'); 
      socket.off('aiSuggestion');
      socket.off('draftQuoteReady', mergeQuoteIntoMessages);
      socket.off('cotizacionActualizada', onCotizacionActualizada);
      socket.off('imageDamageAnalysis', mergeQuoteIntoMessages);
      socket.off('draftPeritajeAwaitingVehicle', onPeritajeAwaitingVehicle);
      socket.off('conversationLeadUpdated', onConversationLeadUpdated);
    };
  }, [selectedConvId]);

  useEffect(() => {
    const cid = searchParams.get('conversation');
    if (cid && cid.trim()) {
      setSelectedConvId(cid.trim());
    }
  }, [searchParams]);

  useEffect(() => {
    if (selectedConvId) { 
      fetchMessagesForConv(selectedConvId); 
      setAiSuggestion(null); 
      handleClearFile(); 
    }
  }, [selectedConvId]);

  // --- ACCIONES DE MULTIMEDIA ---
  const handleFileSelect = (file) => {
    if (!file) return;
    setSelectedFile(file);
    const localUrl = URL.createObjectURL(file);
    setFilePreviewUrl(localUrl);
    setReply(''); 
    setAiSuggestion(null);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    if (filePreviewUrl) { URL.revokeObjectURL(filePreviewUrl); }
    setFilePreviewUrl(null);
  };

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
      const currentConv = contacts.find(c => c.id === selectedConvId);
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

      setContacts((prev) => prev.filter((c) => c.id !== selectedConvId));
      setSelectedConvId(null);
      setMessages([]);
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

  const handleDraftQuotePatched = ({ messageId, draftQuote, damageAnalysis }) => {
    if (!messageId) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              ...(draftQuote !== undefined ? { draftQuote } : {}),
              ...(damageAnalysis !== undefined ? { damageAnalysis } : {}),
            }
          : m,
      ),
    );
  };

  const handleClienteEsperandoAtendido = (conversationId) => {
    setContacts((prev) =>
      prev.map((c) =>
        c.id === conversationId ?
          { ...c, clienteEsperandoAfuera: false }
        : c,
      ),
    );
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
      onRefresh={fetchConversations}
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
    />
    </>
  );
}

export default App;