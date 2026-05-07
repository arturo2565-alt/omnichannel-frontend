import React, { useState, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import ChatView from './ChatView';

const API_BASE_URL = 'https://omnichannel-backend-production.up.railway.app/webhook';

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

  // --- LÓGICA DE CARGA ---
  const fetchConversations = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/conversations`);
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
      const response = await fetch(`${API_BASE_URL}/messages/${convId}`);
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
    };
    socket.on('draftQuoteReady', mergeQuoteIntoMessages);
    socket.on('imageDamageAnalysis', mergeQuoteIntoMessages);
    return () => { 
      socket.off('connect'); 
      socket.off('disconnect'); 
      socket.off('newMessage'); 
      socket.off('aiSuggestion');
      socket.off('draftQuoteReady', mergeQuoteIntoMessages);
      socket.off('imageDamageAnalysis', mergeQuoteIntoMessages);
    };
  }, [selectedConvId]);

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
  const sendMessage = async (textOverride) => {
    const textFromInput = reply.trim();
    const textFromOverride =
      textOverride !== undefined && textOverride !== null
        ? String(textOverride).trim()
        : '';
    const useOverride = textFromOverride.length > 0;
    const textContent = useOverride ? textFromOverride : textFromInput;

    if ((!textContent && !selectedFile) || !selectedConvId || isSending) return;

    setIsSending(true);
    let finalContent = textContent;

    try {
      // --- BLOQUE DE SUBIDA CON LOG DE ERRORES ---
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile); 

        console.log("Subiendo imagen a:", `${API_BASE_URL}/upload`);
        
        const uploadResp = await fetch(`${API_BASE_URL}/upload`, {
          method: 'POST',
          body: formData,
          // El navegador pone el Content-Type automáticamente con el boundary
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
      const newMessage = {
        message: finalContent,
        platform: currentConv?.platform || 'web-dashboard',
        user: 'Arturo (Agente)',
        id: currentConv?.externalId,
        conversationId: selectedConvId,
        direction: 'outbound'
      };

      await fetch(API_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMessage),
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
      const response = await fetch(`${API_BASE_URL}/ai-suggest/${selectedConvId}`, { method: 'POST' });
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

  return (
    <ChatView 
      contacts={contacts}
      selectedConvId={selectedConvId}
      setSelectedConvId={setSelectedConvId}
      selectedUserName={selectedUserName}
      messages={messages}
      reply={reply}
      setReply={setReply}
      onSendMessage={() => sendMessage()}
      onSendQuoteText={(text) => sendMessage(text)}
      onRefresh={fetchConversations}
      quickReplySuggestions={quickReplySuggestions}
      isAiLoading={isAiLoading}
      onGetAiSuggestion={handleGetAiSuggestion}
      isConnected={isConnected}
      filePreviewUrl={filePreviewUrl}
      onFileSelect={handleFileSelect}
      onClearFile={handleClearFile}
      isSending={isSending}
    />
  );
}

export default App;