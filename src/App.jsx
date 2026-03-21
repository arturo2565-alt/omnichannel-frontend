import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import ChatView from './ChatView';

const socket = io('http://localhost:3000');

function App() {
  const [messages, setMessages] = useState([]);
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [reply, setReply] = useState("");
  
  // --- ESTADOS PARA LA IA ---
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false); // Estado de carga para el botón

  const fetchMessages = async () => {
    try {
      const response = await fetch('http://localhost:3000/webhook');
      const data = await response.json();
      setMessages(data);
    } catch (error) { console.error("Error al traer mensajes:", error); }
  };

  // --- FUNCIÓN PARA PEDIR SUGERENCIA MANUAL (POST) ---
  const handleGetAiSuggestion = async () => {
    if (!selectedConvId) return;
    
    setIsAiLoading(true);
    setAiSuggestion(null); // Limpiamos la anterior mientras carga
    try {
      // Nota: Asegúrate de que la URL coincida con tu controlador (/webhook/ai-suggest)
      const response = await fetch(`http://localhost:3000/webhook/ai-suggest/${selectedConvId}`, {
        method: 'POST'
      });
      const data = await response.json();
      setAiSuggestion(data.suggestion);
    } catch (error) {
      console.error("Error pidiendo sugerencia manual:", error);
    } finally {
      setIsAiLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!reply.trim() || !selectedConvId) return;

    const currentContact = messages.find(m => m.conversationId === selectedConvId);

    const newMessage = {
      message: reply,
      platform: 'web-dashboard',
      user: 'Arturo (Agente)', 
      id: currentContact?.externalId, 
      conversationId: selectedConvId, 
      direction: 'outbound'
    };

    try {
      await fetch('http://localhost:3000/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMessage),
      });
      setReply("");
      setAiSuggestion(null); 
    } catch (error) { console.error("Error al enviar:", error); }
  };

  useEffect(() => {
    fetchMessages();

    socket.on('newMessage', (msg) => {
      setMessages((prev) => [msg, ...prev]);
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

  useEffect(() => {
    setAiSuggestion(null);
  }, [selectedConvId]);

  // --- LÓGICA DE DATOS ---
  const contacts = Array.from(new Set(messages.map(msg => msg.conversationId)))
    .map(id => {
        const conversationMsgs = messages.filter(m => m.conversationId === id);
        const clientMsg = conversationMsgs.find(m => m.direction === 'inbound');
        return {
            ...conversationMsgs[0],
            senderName: clientMsg ? clientMsg.senderName : conversationMsgs[0].senderName
        };
    })
    .filter(c => c !== undefined);

  const filteredMessages = messages.filter(msg => msg.conversationId === selectedConvId);
  const selectedUserName = contacts.find(c => c.conversationId === selectedConvId)?.senderName;

  return (
    <ChatView 
      contacts={contacts}
      selectedConvId={selectedConvId}
      setSelectedConvId={setSelectedConvId}
      selectedUserName={selectedUserName}
      messages={filteredMessages}
      reply={reply}
      setReply={setReply}
      onSendMessage={sendMessage}
      onRefresh={fetchMessages}
      aiSuggestion={aiSuggestion}
      isAiLoading={isAiLoading} // Pasamos el estado de carga
      onGetAiSuggestion={handleGetAiSuggestion} // Pasamos la función manual
    />
  );
}

export default App;