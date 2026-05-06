import React, { useRef, useEffect, useState, useMemo } from 'react';
import QuickReplies from './QuickReplies';

// --- FUNCIONES DE UTILIDAD (Fuera del componente) ---
const classifyPlatform = (raw) => {
  if (!raw) return 'unknown';
  const s = String(raw).toLowerCase().trim();
  if (s.includes('whatsapp')) return 'whatsapp';
  if (s.includes('instagram')) return 'instagram';
  return 'other';
};

const PlatformBadge = ({ platform, className = '' }) => {
  const kind = classifyPlatform(platform);
  if (kind === 'whatsapp') {
    return (
      <span title="WhatsApp" className={`inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500 text-[10px] font-bold text-white shadow-sm shrink-0 ${className}`} aria-hidden>
        W
      </span>
    );
  }
  if (kind === 'instagram') {
    return (
      <span title="Instagram" className={`inline-flex items-center justify-center w-6 h-6 rounded-full bg-pink-500 text-[10px] font-bold text-white shadow-sm shrink-0 ${className}`} aria-hidden>
        I
      </span>
    );
  }
  return (
    <span title="Canal desconocido" className={`inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-400 text-[9px] font-bold text-white shadow-sm shrink-0 ${className}`} aria-hidden>
      ?
    </span>
  );
};

const isImage = (url) => {
  if (!url) return false;
  // Soporte para URLs reales y para URLs temporales de blob
  return (url.match(/\.(jpeg|jpg|gif|png|webp)$/) != null) || url.includes('images.unsplash.com') || url.startsWith('blob:');
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
  quickReplySuggestions,
  onGetAiSuggestion, 
  isAiLoading,
  isConnected,

  // --- 🌟 NUEVAS PROPS 🌟 ---
  filePreviewUrl, // URL temporal del blob
  onFileSelect,   // Función handleFileSelect de App.jsx
  onClearFile,    // Función handleClearFile de App.jsx
  isSending       // Estado de carga del envío
}) {

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null); // Referencia al input hidden
  const [platformFilter, setPlatformFilter] = useState('all');

  const filteredContacts = useMemo(() => {
    if (platformFilter === 'all') return contacts;
    return contacts.filter((c) => classifyPlatform(c.platform) === platformFilter);
  }, [contacts, platformFilter]);

  const selectedContact = contacts.find((c) => c.id === selectedConvId);

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    if (!selectedConvId || platformFilter === 'all') return;
    const visible = filteredContacts.some((c) => c.id === selectedConvId);
    if (!visible) setSelectedConvId(null);
  }, [filteredContacts, platformFilter, selectedConvId, setSelectedConvId]);

  return (
    <div className="flex h-screen bg-gray-100 text-gray-900 overflow-hidden font-sans">
      
      {/* 1. SIDEBAR CANALES */}
      <div className="w-20 bg-gray-900 flex flex-col items-center py-4 space-y-4 shadow-xl z-10">
        <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white font-bold cursor-pointer hover:scale-105 transition shadow-lg">W</div>
        <div className="w-12 h-12 bg-pink-500 rounded-full flex items-center justify-center text-white font-bold cursor-pointer hover:scale-105 transition shadow-lg">I</div>
      </div>

      {/* 2. LISTA CONTACTOS */}
      <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col shadow-inner">
        <div className="border-b bg-white sticky top-0 z-10 shadow-sm">
          <div className="p-4 pb-3 font-bold text-xl flex justify-between items-center">
            <span>Bandeja</span>
            <button onClick={onRefresh} className="text-[10px] bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded text-blue-600 font-medium transition">🔄 Actualizar</button>
          </div>
          <div className="px-4 pb-3 flex gap-1.5 flex-wrap items-center font-normal">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'whatsapp', label: 'WhatsApp' },
              { id: 'instagram', label: 'Instagram' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPlatformFilter(id)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                  platformFilter === id
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredContacts.map((contact) => (
            <div key={contact.id} onClick={() => setSelectedConvId(contact.id)} className={`p-4 cursor-pointer border-b transition flex items-center space-x-3 ${selectedConvId === contact.id ? 'bg-blue-50 border-r-4 border-r-blue-500' : 'hover:bg-gray-50'}`}>
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-bold shadow-md text-lg">
                  {contact.contactName ? contact.contactName.charAt(0).toUpperCase() : '?'}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white rounded-full">
                  <PlatformBadge platform={contact.platform} className="!w-5 !h-5 !text-[9px]" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <p className="font-bold text-gray-800 truncate">{contact.contactName}</p>
                  <span className="text-[10px] text-gray-400 ml-2 shrink-0">{contact.lastMessageAt ? new Date(contact.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-1 italic">
                  {contact.direction === 'outbound' ? <span className="text-blue-500 font-medium">Tú: </span> : ''}
                  {getPreviewText(contact.lastMessage)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. VENTANA CHAT */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedConvId ? (
          <>
            {/* Header Chat */}
            <div className="p-4 border-b shadow-sm font-semibold bg-white flex justify-between items-center z-10">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold border border-blue-200">{selectedUserName?.charAt(0).toUpperCase()}</div>
                  <div className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white rounded-full">
                    <PlatformBadge platform={selectedContact?.platform} className="!w-5 !h-5 !text-[9px]" />
                  </div>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm truncate">{selectedUserName}</span>
                  <span className="text-[10px] text-gray-400 font-normal truncate">ID: {selectedConvId}</span>
                </div>
              </div>
              <span className={`text-xs font-normal flex items-center ${isConnected ? 'text-green-500' : 'text-red-500'}`}><span className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>{isConnected ? 'Online' : 'Desconectado'}</span>
            </div>
            
            {/* Mensajes Chat */}
            <div className="flex-1 p-6 bg-[#e5ddd5] overflow-y-auto flex flex-col space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className={`p-3 rounded-2xl shadow-sm max-w-[80%] ${msg.direction === 'inbound' ? 'bg-white self-start text-gray-800 rounded-tl-none' : 'bg-indigo-600 text-white self-end rounded-tr-none'}`}>
                  {isImage(msg.content) ? (
                    <img src={msg.content} alt="Adjunto" className="rounded-lg max-h-72 object-cover cursor-pointer hover:opacity-95 transition" onClick={() => window.open(msg.content, '_blank')} />
                  ) : ( <p className="text-sm leading-relaxed">{msg.content}</p> )}
                  <div className={`text-[9px] mt-1 text-right opacity-60 ${msg.direction === 'inbound' ? 'text-gray-500' : 'text-indigo-100'}`}>{msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* --- SECCIÓN DE ENTRADA PRO (Multimedia + IA) --- */}
            <div className="p-4 border-t bg-gray-50 mt-auto z-10">
              
              <QuickReplies
                suggestions={quickReplySuggestions}
                onPick={setReply}
                disabled={!!filePreviewUrl}
              />

              {/* --- 🌟 VISTA PREVIA DE LA IMAGEN (Thumbnail) 🌟 --- */}
              {filePreviewUrl && (
                <div className="mb-3 p-2 bg-white border border-gray-200 rounded-xl shadow-lg flex items-center space-x-3 relative animate-in fade-in slide-in-from-bottom-2">
                  <img 
                    src={filePreviewUrl} 
                    alt="Previsualización" 
                    className="w-16 h-16 rounded-lg object-cover border border-gray-100"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">Imagen seleccionada</p>
                    <p className="text-xs text-gray-500">Lista para enviar a Cloudinary</p>
                  </div>
                  {/* Botón ✕ para cancelar */}
                  <button 
                    onClick={onClearFile}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-gray-800 text-white rounded-full flex items-center justify-center text-xs hover:bg-gray-600 shadow-md transition"
                    title="Cancelar imagen"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Barra de Entrada */}
              <div className="flex space-x-2 items-center">
                
                {/* Botón Clip 📎 (Hidden Input Trigger) */}
                <button 
                  onClick={() => fileInputRef.current.click()}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all bg-white border border-gray-200 text-gray-500 hover:bg-gray-100 hover:scale-105 active:scale-95 shadow-sm"
                  title="Adjuntar imagen"
                >
                  📎
                </button>
                {/* INPUT HIDDEN REAL */}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={(e) => {
                    onFileSelect(e.target.files[0]);
                    e.target.value = null; // Reset para poder elegir la misma imagen dos veces
                  }} 
                />

                {/* Botón IA ✨ */}
                {!filePreviewUrl && (
                    <button onClick={onGetAiSuggestion} disabled={isAiLoading} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-md border ${isAiLoading ? 'bg-gray-100 border-gray-200' : 'bg-white border-purple-200 text-purple-600 hover:bg-purple-50 hover:scale-110 active:scale-95'}`}>
                    {isAiLoading ? <span className="animate-spin">⏳</span> : '✨'}
                    </button>
                )}

                {/* Input de Texto (Deshabilitado si hay imagen para simplificar) */}
                <input 
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !filePreviewUrl && onSendMessage()}
                  disabled={!!filePreviewUrl || isSending}
                  className={`flex-1 border border-gray-200 rounded-full px-5 py-2.5 outline-none focus:ring-2 focus:ring-indigo-400 transition-all bg-white shadow-inner ${filePreviewUrl ? 'bg-gray-100 text-gray-400 italic' : ''}`} 
                  placeholder={filePreviewUrl ? "Imagen lista. Haz clic en Enviar ->" : `Responder a ${selectedUserName}...`} 
                />
                
                {/* Botón Enviar 🚀 */}
                <button 
                  onClick={onSendMessage} 
                  disabled={isSending}
                  className={`bg-indigo-600 text-white px-6 py-2.5 rounded-full font-bold hover:bg-indigo-700 shadow-md active:scale-95 transition-all flex items-center space-x-2 ${isSending ? 'opacity-70 bg-gray-500' : ''}`}
                >
                  {isSending ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Subiendo...</span>
                    </>
                  ) : (
                    <span>Enviar</span>
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-center bg-gray-50">
            <div><div className="text-8xl mb-4 opacity-10">💬</div><p className="text-xl font-semibold text-gray-400">Bandeja de Entrada</p><p className="text-sm opacity-60">Selecciona un chat para empezar a gestionar</p></div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatView;