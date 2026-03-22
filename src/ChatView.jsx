import React, { useRef, useEffect } from 'react';

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
  isAiLoading        
}) {

  // --- 1. REFERENCIA PARA EL AUTO-SCROLL ---
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // --- 2. EFECTO: BAJAR CADA VEZ QUE CAMBIEN LOS MENSAJES ---
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // --- FUNCIÓN DE DETECCIÓN DE IMAGEN ---
  const isImage = (url) => {
    if (!url) return false;
    return (url.match(/\.(jpeg|jpg|gif|png|webp)$/) != null) || url.includes('images.unsplash.com');
  };

  return (
    <div className="flex h-screen bg-gray-100 text-gray-900 overflow-hidden">
      
      {/* 1. SIDEBAR DE CANALES */}
      <div className="w-20 bg-gray-900 flex flex-col items-center py-4 space-y-4 shadow-xl z-10">
        <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white font-bold cursor-pointer hover:scale-105 transition">W</div>
        <div className="w-12 h-12 bg-pink-500 rounded-full flex items-center justify-center text-white font-bold cursor-pointer hover:scale-105 transition">Z</div>
      </div>

      {/* 2. LISTA DE CONTACTOS */}
      <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b font-bold text-xl flex justify-between items-center bg-white">
          Bandeja
          <button onClick={onRefresh} className="text-[10px] text-blue-500 hover:text-blue-700 underline">Actualizar</button>
        </div>
        
        <div className="flex-1 overflow-y-auto bg-white">
          {contacts.map((contact) => (
            <div 
              key={contact.id} 
              onClick={() => setSelectedConvId(contact.conversationId)}
              className={`p-4 cursor-pointer border-b transition flex items-center space-x-3 ${
                selectedConvId === contact.conversationId ? 'bg-blue-50 border-r-4 border-r-blue-500' : 'hover:bg-gray-50'
              }`}
            >
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center text-white font-bold shadow-md">
                  {contact.senderName ? contact.senderName.charAt(0).toUpperCase() : '?'}
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <p className="font-bold text-gray-800 truncate">{contact.senderName}</p>
                  <span className="text-[10px] text-gray-400 ml-2">
                    {contact.createdAt ? new Date(contact.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-1">
                  {contact.direction === 'outbound' ? <span className="text-blue-500 font-medium">Tú: </span> : ''}
                  {isImage(contact.content) ? '📷 Imagen' : contact.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. VENTANA DE CHAT */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedConvId ? (
          <>
            <div className="p-4 border-b shadow-sm font-semibold bg-white flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                  {selectedUserName?.charAt(0).toUpperCase()}
                </div>
                <span>Chat con {selectedUserName}</span>
              </div>
              <span className="text-xs text-green-500 font-normal flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                Online
              </span>
            </div>
            
            <div className="flex-1 p-6 bg-[#f0f2f5] overflow-y-auto flex flex-col space-y-3">
              {messages.slice().reverse().map((msg) => (
                <div 
                  key={msg.id} 
                  className={`p-3 rounded-2xl shadow-sm max-w-md ${
                    msg.direction === 'inbound' 
                      ? 'bg-white self-start text-gray-800' 
                      : 'bg-blue-600 text-white self-end'
                  }`}
                >
                  {isImage(msg.content) ? (
                    <div className="flex flex-col space-y-1">
                      <img 
                        src={msg.content} 
                        alt="Adjunto" 
                        className="rounded-lg max-h-64 object-cover cursor-pointer hover:opacity-95 transition"
                        onClick={() => window.open(msg.content, '_blank')} 
                      />
                      <span className={`text-[9px] opacity-70 text-right ${msg.direction === 'inbound' ? 'text-gray-400' : 'text-blue-100'}`}>
                        {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                      <div className={`text-[9px] mt-1 text-right ${msg.direction === 'inbound' ? 'text-gray-400' : 'text-blue-100'}`}>
                        {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </>
                  )}
                </div>
              ))}
              {/* --- 3. ELEMENTO ANCLA PARA EL SCROLL --- */}
              <div ref={messagesEndRef} />
            </div>

            {/* --- SECCIÓN DE ENTRADA Y IA --- */}
            <div className="p-4 border-t bg-white">
              
              {aiSuggestion && (
                <div 
                  onClick={() => setReply(aiSuggestion)}
                  className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-xl cursor-pointer hover:bg-purple-100 transition-all animate-in fade-in slide-in-from-bottom-2 duration-300 group"
                >
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-[10px] text-purple-600 font-bold uppercase tracking-wider">✨ Sugerencia de IA (Click para usar)</p>
                    <span className="text-gray-300 group-hover:text-purple-400 transition-colors">✕</span>
                  </div>
                  <p className="text-sm text-gray-700 italic">"{aiSuggestion}"</p>
                </div>
              )}

              <div className="flex space-x-2 items-center">
                <button 
                  onClick={onGetAiSuggestion}
                  disabled={isAiLoading}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-sm border ${
                    isAiLoading 
                    ? 'bg-gray-100 border-gray-200' 
                    : 'bg-purple-100 border-purple-200 text-purple-600 hover:bg-purple-200 hover:scale-110 active:scale-95'
                  }`}
                  title="Generar respuesta inteligente"
                >
                  {isAiLoading ? <span className="animate-spin inline-block">⏳</span> : '✨'}
                </button>

                <input 
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && onSendMessage()}
                  className="flex-1 border border-gray-200 rounded-full px-4 py-2 outline-none focus:ring-2 focus:ring-purple-400 transition-all" 
                  placeholder={`Escribe o usa la IA para responder a ${selectedUserName}...`} 
                />
                
                <button 
                  onClick={onSendMessage} 
                  className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold hover:bg-blue-700 shadow-md active:scale-95 transition"
                >
                  Enviar
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-center bg-gray-50">
            <div>
              <div className="text-7xl mb-4 opacity-20">💬</div>
              <p className="text-lg font-medium text-gray-500">Selecciona una conversación</p>
              <p className="text-sm opacity-60">Tus mensajes e imágenes aparecerán aquí</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatView;