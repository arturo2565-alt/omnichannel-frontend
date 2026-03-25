import React, { useRef, useEffect } from 'react';

// --- FUNCIONES DE UTILIDAD ---

const isImage = (url) => {
  if (!url) return false;
  // Detecta extensiones comunes o links de Unsplash/Cloudinary
  return (url.match(/\.(jpeg|jpg|gif|png|webp)$/) != null) || 
         url.includes('images.unsplash.com') || 
         url.includes('res.cloudinary.com');
};

const getPreviewText = (content) => {
  if (!content) return 'Sin mensajes aún...';
  if (isImage(content)) return '📷 Imagen';
  return content;
};

function ChatView({ 
  contacts, 
  selectedConvId, 
  setSelectedConvId, 
  selectedUserName, 
  messages, 
  reply, 
  setReply, 
  onSendMessage, 
  onRefresh,
  aiSuggestion,      
  onGetAiSuggestion, 
  isAiLoading,
  isConnected,
  onUploadImage // <--- Nueva prop para manejar la subida
}) {

  // --- REFERENCIAS ---
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null); // <--- Referencia para el input de archivos

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex h-screen bg-gray-100 text-gray-900 overflow-hidden">
      
      {/* 1. SIDEBAR DE CANALES */}
      <div className="w-20 bg-gray-900 flex flex-col items-center py-4 space-y-4 shadow-xl z-10">
        <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white font-bold cursor-pointer hover:scale-105 transition shadow-lg">W</div>
        <div className="w-12 h-12 bg-pink-500 rounded-full flex items-center justify-center text-white font-bold cursor-pointer hover:scale-105 transition shadow-lg">I</div>
      </div>

      {/* 2. LISTA DE CONTACTOS */}
      <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col shadow-inner">
        <div className="p-4 border-b font-bold text-xl flex justify-between items-center bg-white sticky top-0 z-10">
          <span>Bandeja</span>
          <button 
            onClick={onRefresh} 
            className="text-[10px] bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded text-blue-600 font-medium transition"
          >
            🔄 Actualizar
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {contacts.length > 0 ? (
            contacts.map((contact) => (
              <div 
                key={contact.id} 
                onClick={() => setSelectedConvId(contact.id)}
                className={`p-4 cursor-pointer border-b transition flex items-center space-x-3 ${
                  selectedConvId === contact.id ? 'bg-blue-50 border-r-4 border-r-blue-500' : 'hover:bg-gray-50'
                }`}
              >
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-bold shadow-md text-lg">
                    {contact.contactName ? contact.contactName.charAt(0).toUpperCase() : '?'}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <p className="font-bold text-gray-800 truncate">{contact.contactName}</p>
                    <span className="text-[10px] text-gray-400 ml-2">
                      {contact.lastMessageAt ? new Date(contact.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-1 italic">
                    {contact.direction === 'outbound' ? <span className="text-blue-500 font-medium">Tú: </span> : ''}
                    {getPreviewText(contact.lastMessage)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="p-10 text-center text-gray-400 text-sm">No hay conversaciones activas</div>
          )}
        </div>
      </div>

      {/* 3. VENTANA DE CHAT */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedConvId ? (
          <>
            {/* Header */}
            <div className="p-4 border-b shadow-sm font-semibold bg-white flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold border border-blue-200">
                  {selectedUserName?.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm">{selectedUserName}</span>
                  <span className="text-[10px] text-gray-400 font-normal">ID: {selectedConvId}</span>
                </div>
              </div>
              <span className={`text-xs font-normal flex items-center ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
                <span className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                {isConnected ? 'Online' : 'Desconectado'}
              </span>
            </div>
            
            {/* Mensajes */}
            <div className="flex-1 p-6 bg-[#e5ddd5] overflow-y-auto flex flex-col space-y-3">
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`p-3 rounded-2xl shadow-sm max-w-[80%] ${
                    msg.direction === 'inbound' 
                      ? 'bg-white self-start text-gray-800 rounded-tl-none' 
                      : 'bg-indigo-600 text-white self-end rounded-tr-none'
                  }`}
                >
                  {isImage(msg.content) ? (
                    <img 
                      src={msg.content} 
                      alt="Adjunto" 
                      className="rounded-lg max-h-72 object-cover cursor-pointer hover:opacity-95 transition"
                      onClick={() => window.open(msg.content, '_blank')} 
                    />
                  ) : (
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  )}
                  <div className={`text-[9px] mt-1 text-right opacity-60 ${msg.direction === 'inbound' ? 'text-gray-500' : 'text-indigo-100'}`}>
                    {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Sección de Entrada */}
            <div className="p-4 border-t bg-gray-50">
              {aiSuggestion && (
                <div 
                  onClick={() => setReply(aiSuggestion)}
                  className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-xl cursor-pointer hover:bg-purple-100 transition-all shadow-sm group"
                >
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-[10px] text-purple-600 font-bold uppercase tracking-wider">✨ Sugerencia de IA</p>
                    <span className="text-gray-300 group-hover:text-purple-400">✕</span>
                  </div>
                  <p className="text-sm text-gray-700 italic font-medium">"{aiSuggestion}"</p>
                </div>
              )}

              <div className="flex space-x-2 items-center">
                {/* BOTÓN CLIP (ADJUNTAR) */}
                <button 
                  onClick={() => fileInputRef.current.click()}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-indigo-600 transition shadow-sm"
                  title="Adjuntar imagen"
                >
                  📎
                </button>

                {/* INPUT FILE OCULTO */}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={(e) => {
                    if (e.target.files[0]) onUploadImage(e.target.files[0]);
                  }} 
                  accept="image/*"
                />

                {/* BOTÓN IA */}
                <button 
                  onClick={onGetAiSuggestion}
                  disabled={isAiLoading}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-md border ${
                    isAiLoading ? 'bg-gray-100 border-gray-200' : 'bg-white border-purple-200 text-purple-600 hover:bg-purple-50 hover:scale-110 active:scale-95'
                  }`}
                >
                  {isAiLoading ? <span className="animate-spin">⏳</span> : '✨'}
                </button>

                <input 
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && onSendMessage()}
                  className="flex-1 border border-gray-200 rounded-full px-5 py-2.5 outline-none focus:ring-2 focus:ring-indigo-400 transition-all bg-white shadow-inner" 
                  placeholder={`Responder a ${selectedUserName}...`} 
                />
                
                <button 
                  onClick={onSendMessage} 
                  className="bg-indigo-600 text-white px-6 py-2.5 rounded-full font-bold hover:bg-indigo-700 shadow-md active:scale-95 transition-all"
                >
                  Enviar
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-center bg-gray-50">
            <div>
              <div className="text-8xl mb-4 opacity-10">💬</div>
              <p className="text-xl font-semibold text-gray-400">Bandeja de Entrada</p>
              <p className="text-sm opacity-60">Selecciona un chat para empezar a gestionar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatView;