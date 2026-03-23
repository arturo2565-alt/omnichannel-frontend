import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import ChatView from './ChatView';

const API_BASE_URL = 'https://omnichannel-backend-production.up.railway.app';
const socket = io(API_BASE_URL, {
  transports: ['websocket'],
  upgrade: false
});

function App() {
  const [contacts, setContacts] = useState([]); // Nuevo estado para el Sidebar
  const [messages, setMessages] = useState([]); // Solo mensajes del chat activo
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [reply, setReply] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // 1. CARGAR SOLO CONTACTOS (Sidebar)
  const fetchContacts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/webhook/conversations`);
      const data = await response.json();
      setContacts(data);
    } catch (error) { console.error("Error contactos:", error); }
  };

  // 2. CARGAR MENSAJES DE CONVERSACIÓN SELECCIONADA
  const fetchMessagesByConv = async (convId) => {
    if (!convId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/webhook/messages/${convId}`);
      const data = await response.json();
      setMessages(data);
    } catch (error) { console.error("Error mensajes:", error); }
  };

  // --- EFECTO INICIAL: Solo contactos ---
  useEffect(() => {
    fetchContacts();

    socket.on('newMessage', (msg) => {
      // Si el mensaje es para el chat que estoy viendo, lo añado
      if (msg.conversationId === selectedConvId) {
        setMessages((prev) => [msg, ...prev]);
      }
      // Siempre refrescamos contactos para que el último chat suba al principio
      fetchContacts();
    });

    socket.on('aiSuggestion', (data) => {
      if (data.conversationId === selectedConvId) {
        setAiSuggestion(data.suggestion);
      }
    });

    return () => {
      socket.off('newMessage');
      socket.off('aiSuggestion');
    };
  }, [selectedConvId]);

  // --- EFECTO: Cargar mensajes cuando cambia el chat seleccionado ---
  useEffect(() => {
    if (selectedConvId) {
      fetchMessagesByConv(selectedConvId);
      setAiSuggestion(null);
    }
  }, [selectedConvId]);

  const handleGetAiSuggestion = async () => {
    if (!selectedConvId) return;
    setIsAiLoading(true);
    setAiSuggestion(null);
    try {
      const response = await fetch(`${API_BASE_URL}/webhook/ai-suggest/${selectedConvId}`, {
        method: 'POST'
      });
      const data = await response.json();
      setAiSuggestion(data.suggestion);
    } catch (error) {
      console.error("Error IA:", error);
    } finally {
      setIsAiLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!reply.trim() || !selectedConvId) return;

    const currentContact = contacts.find(c => c.id === selectedConvId);

    const newMessage = {
      message: reply,
      platform: 'web-dashboard',
      user: 'Arturo (Agente)', 
      id: currentContact?.externalId, 
      conversationId: selectedConvId, 
      direction: 'outbound'
    };

    try {
      await fetch(`${API_BASE_URL}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMessage),
      });
      setReply("");
      setAiSuggestion(null);
      // Opcional: Podrías añadir el mensaje localmente aquí para feedback instantáneo
    } catch (error) { console.error("Error al enviar:", error); }
  };

  const selectedUserName = contacts.find(c => c.id === selectedConvId)?.contactName;

  return (
    <ChatView 
      contacts={contacts}
      selectedConvId={selectedConvId}
      setSelectedConvId={setSelectedConvId}
      selectedUserName={selectedUserName}
      messages={messages} // Ahora pasamos directamente los mensajes cargados
      reply={reply}
      setReply={setReply}
      onSendMessage={sendMessage}
      onRefresh={fetchContacts}
      aiSuggestion={aiSuggestion}
      isAiLoading={isAiLoading}
      onGetAiSuggestion={handleGetAiSuggestion}
    />
  );
}

export default App;