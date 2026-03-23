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
      // Invertimos el orden si el backend los manda DESC para que el scroll funcione bien
      setMessages(data.reverse());
    } catch (error) {
      console.error("Error al traer mensajes:", error);
    }
  };

  // --- EFECTOS ---

  // Al montar la app: traer contactos y configurar Sockets
  useEffect(() => {
    fetchConversations();

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('newMessage', (msg) => {
      // Si el mensaje es de la conversación que tengo abierta, lo agrego al chat
      if (msg.conversationId === selectedConvId || msg.conversation?.id === selectedConvId) {
        setMessages((prev) => [...prev, msg]);
      }
      // Siempre refrescamos la lista de contactos para que el último mensaje suba al principio
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

  // Cada vez que el usuario cambie de chat en el Sidebar
  useEffect(() => {
    if (selectedConvId) {
      fetchMessagesForConv(selectedConvId);
      setAiSuggestion(null);
    }
  }, [selectedConvId]);

  // --- ACCIONES ---

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

  const sendMessage = async () => {
    if (!reply.trim() || !selectedConvId) return;

    // Buscamos el externalId para que la plataforma sepa a quién responder
    const currentConv = contacts.find(c => c.id === selectedConvId);

    const newMessage = {
      message: reply,
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
      setReply("");
      setAiSuggestion(null);
    } catch (error) {
      console.error("Error al enviar:", error);
    }
  };

  // Buscamos el nombre del contacto seleccionado para el header del chat
  const selectedUserName = contacts.find(c => c.id === selectedConvId)?.contactName || "Usuario";

  return (
    <ChatView 
      contacts={contacts} // Ahora vienen directamente de la DB de conversaciones
      selectedConvId={selectedConvId}
      setSelectedConvId={setSelectedConvId}
      selectedUserName={selectedUserName}
      messages={messages} // Solo los de la conversación activa
      reply={reply}
      setReply={setReply}
      onSendMessage={sendMessage}
      onRefresh={fetchConversations}
      aiSuggestion={aiSuggestion}
      isAiLoading={isAiLoading}
      onGetAiSuggestion={handleGetAiSuggestion}
      isConnected={isConnected} // Nueva prop opcional por si quieres mostrar el estado
    />
  );
}

export default App;