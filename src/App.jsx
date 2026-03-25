import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import ChatView from './ChatView';

// URL base para no repetirla
const API_BASE_URL = 'https://omnichannel-backend-production.up.railway.app/webhook';

const socket = io('https://omnichannel-backend-production.up.railway.app', {
  transports: ['websocket'],
  upgrade: false
});

function App() {
  // --- ESTADOS ---
  const [contacts, setContacts] = useState([]); // Lista de conversaciones (Sidebar)
  const [messages, setMessages] = useState([]); // Mensajes del chat seleccionado
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [reply, setReply] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [isConnected, setIsConnected] = useState(socket.connected);

  // 1. Cargar solo la lista de conversaciones (Sidebar)
  const fetchConversations = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/conversations`);
      const data = await response.json();
      setContacts(data);
    } catch (error) {
      console.error("Error al traer conversaciones:", error);
    }
  };

  // 2. Cargar mensajes de una conversación específica
  const fetchMessagesForConv = async (convId) => {
    if (!convId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/messages/${convId}`);
      const data = await response.json();
      // Usamos reverse() para que el scroll y el orden cronológico coincidan
      setMessages(data.reverse());
    } catch (error) {
      console.error("Error al traer mensajes:", error);
    }
  };

  // --- ACCIÓN DE SUBIDA DE IMAGEN ---
  const uploadAndSendImage = async (file) => {
    if (!selectedConvId) return;
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      // 1. Subimos la imagen al backend para obtener URL de Cloudinary
      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });
      const { url } = await response.json();

      // 2. Enviamos la URL automáticamente como un mensaje
      await sendMessage(url); 
      
    } catch (error) {
      console.error("Error al subir imagen:", error);
    }
  };

  // --- EFECTOS ---

  useEffect(() => {
    fetchConversations();

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('newMessage', (msg) => {
      // Si el mensaje es de la conversación que tengo abierta, lo agrego
      if (msg.conversationId === selectedConvId || msg.conversation?.id === selectedConvId) {
        setMessages((prev) => [...prev, msg]);
      }
      fetchConversations();
    });

    socket.on('aiSuggestion', (data) => {
      if (data.conversationId === selectedConvId) {
        setAiSuggestion(data.suggestion);
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('newMessage');
      socket.off('aiSuggestion');
    };
  }, [selectedConvId]);

  useEffect(() => {
    if (selectedConvId) {
      fetchMessagesForConv(selectedConvId);
      setAiSuggestion(null);
    }
  }, [selectedConvId]);

  // --- ACCIONES DE MENSAJERÍA ---

  const handleGetAiSuggestion = async () => {
    if (!selectedConvId) return;
    setIsAiLoading(true);
    setAiSuggestion(null);
    try {
      const response = await fetch(`${API_BASE_URL}/ai-suggest/${selectedConvId}`, { method: 'POST' });
      const data = await response.json();
      setAiSuggestion(data.suggestion);
    } catch (error) {
      console.error("Error en sugerencia manual:", error);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Modificamos sendMessage para que acepte un parámetro opcional (útil para imágenes)
  const sendMessage = async (contentOverride = null) => {
    const textToSend = contentOverride || reply;
    if (!textToSend.trim() || !selectedConvId) return;

    const currentConv = contacts.find(c => c.id === selectedConvId);

    const newMessage = {
      message: textToSend,
      platform: currentConv?.platform || 'web-dashboard',
      user: 'Arturo (Agente)',
      id: currentConv?.externalId,
      conversationId: selectedConvId,
      direction: 'outbound'
    };

    try {
      await fetch(API_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMessage),
      });
      
      if (!contentOverride) setReply(""); // Solo limpiamos el input si no es una imagen
      setAiSuggestion(null);
    } catch (error) {
      console.error("Error al enviar:", error);
    }
  };

  const selectedUserName = contacts.find(c => c.id === selectedConvId)?.contactName || "Usuario";

  return (
    <ChatView 
      contacts={contacts}
      selectedConvId={selectedConvId}
      setSelectedConvId={setSelectedConvId}
      selectedUserName={selectedUserName}
      messages={messages}
      reply={reply}
      setReply={setReply}
      onSendMessage={() => sendMessage()} // Llamada normal desde el botón enviar
      onUploadImage={uploadAndSendImage} // Nueva prop para manejar archivos
      onRefresh={fetchConversations}
      aiSuggestion={aiSuggestion}
      isAiLoading={isAiLoading}
      onGetAiSuggestion={handleGetAiSuggestion}
      isConnected={isConnected}
    />
  );
}

export default App;