import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import ChatView from './ChatView';

const API_BASE_URL = 'https://omnichannel-backend-production.up.railway.app/webhook';
const socket = io('https://omnichannel-backend-production.up.railway.app', { transports: ['websocket'], upgrade: false });

function App() {
  // --- ESTADOS ---
  const [contacts, setContacts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [reply, setReply] = useState("");
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);

  // --- 🌟 NUEVOS ESTADOS PARA MULTIMEDIA PRO 🌟 ---
  const [selectedFile, setSelectedFile] = useState(null); // El archivo real para Multer
  const [filePreviewUrl, setFilePreviewUrl] = useState(null); // La URL temporal para <img src>
  const [isSending, setIsSending] = useState(false); // Estado de carga al enviar (texto o foto)

  // --- LÓGICA DE CARGA ---
  const fetchConversations = async () => { /* ... (Igual que antes) ... */
    try {
      const response = await fetch(`${API_BASE_URL}/conversations`);
      const data = await response.json();
      setContacts(data);
    } catch (error) { console.error("Error conversaciones:", error); }
  };

  const fetchMessagesForConv = async (convId) => { /* ... (Igual que antes) ... */
    if (!convId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/messages/${convId}`);
      const data = await response.json();
      setMessages(data.reverse()); // Asumimos que llegan DESC y los invertimos para orden cronológico
    } catch (error) { console.error("Error mensajes:", error); }
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
    return () => { socket.off('connect'); socket.off('disconnect'); socket.off('newMessage'); socket.off('aiSuggestion'); };
  }, [selectedConvId]);

  useEffect(() => {
    if (selectedConvId) { fetchMessagesForConv(selectedConvId); setAiSuggestion(null); handleClearFile(); // Limpiamos preview al cambiar de chat
    }
  }, [selectedConvId]);

  // --- 🌟 ACCIONES DE MULTIMEDIA 🌟 ---

  // 1. Cuando el usuario elige un archivo en su ordenador
  const handleFileSelect = (file) => {
    if (!file) return;
    setSelectedFile(file); // Guardamos el archivo para enviarlo después
    
    // Creamos una URL temporal local (blob:) para la miniatura
    const localUrl = URL.createObjectURL(file);
    setFilePreviewUrl(localUrl);
    
    // Opcional: Limpiar texto si hay una imagen
    setReply(''); 
    setAiSuggestion(null);
  };

  // 2. Cancelar la imagen (botón ✕ en la miniatura)
  const handleClearFile = () => {
    setSelectedFile(null);
    // Revocamos la URL temporal para liberar memoria en el Mac
    if (filePreviewUrl) { URL.revokeObjectURL(filePreviewUrl); }
    setFilePreviewUrl(null);
  };

  // 3. LA FUNCIÓN MAESTRA DE ENVÍO (Texto O Foto)
  const sendMessage = async () => {
    // Validación: Necesitamos o texto o archivo, y una conversación seleccionada
    if ((!reply.trim() && !selectedFile) || !selectedConvId || isSending) return;

    setIsSending(true); // Bloqueamos el botón
    let finalContent = reply; // Por defecto es el texto

    try {
      // --- 🌟 FLUJO DE SUBIDA SI HAY ARCHIVO 🌟 ---
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile); // Asegúrate que coincida con FileInterceptor('file') del Backend

        console.log("Subiendo imagen a Cloudinary vía Backend...");
        const uploadResp = await fetch(`${API_BASE_URL}/upload`, {
          method: 'POST',
          body: formData, // No enviamos headers, fetch lo hace solo con FormData
        });
        
        if (!uploadResp.ok) throw new Error("Fallo la subida al Backend");
        
        const { url } = await uploadResp.json();
        finalContent = url; // Reemplazamos el texto por la URL segura de Cloudinary
        console.log("Imagen subida con éxito:", url);
      }

      // --- FLUJO DE ENVÍO DE MENSAJE (Como antes) ---
      const currentConv = contacts.find(c => c.id === selectedConvId);
      const newMessage = {
        message: finalContent, // O texto o la URL de Cloudinary
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

      // Limpieza total
      setReply("");
      handleClearFile(); // Limpiamos selectedFile y filePreviewUrl
      setAiSuggestion(null);

    } catch (error) {
      console.error("Error crítico al enviar:", error);
      alert("No se pudo enviar el mensaje o la imagen. Revisa la consola.");
    } finally {
      setIsSending(false); // Desbloqueamos el botón
    }
  };

  // --- ACCIONES DE IA ---
  const handleGetAiSuggestion = async () => { /* ... (Igual que antes) ... */
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

  return (
    <ChatView 
      contacts={contacts}
      selectedConvId={selectedConvId}
      setSelectedConvId={setSelectedConvId}
      selectedUserName={selectedUserName}
      messages={messages}
      reply={reply}
      setReply={setReply}
      onSendMessage={sendMessage}
      onRefresh={fetchConversations}
      aiSuggestion={aiSuggestion}
      isAiLoading={isAiLoading}
      onGetAiSuggestion={handleGetAiSuggestion}
      isConnected={isConnected}
      
      // --- 🌟 NUEVAS PROPS PARA MULTIMEDIA PRO 🌟 ---
      filePreviewUrl={filePreviewUrl} // Para mostrar la miniatura
      onFileSelect={handleFileSelect} // Para cuando eliges archivo
      onClearFile={handleClearFile} // Para cancelar
      isSending={isSending} // Para poner 'Enviando...' en el botón
    />
  );
}

export default App;