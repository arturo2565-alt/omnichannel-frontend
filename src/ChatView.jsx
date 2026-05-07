import React, { useRef, useEffect, useState, useMemo } from 'react';
import QuickReplies from './QuickReplies';

// --- FUNCIONES DE UTILIDAD (Fuera del componente) ---
// Añade soporte para Facebook y mejora la visualización del badge con círculo perfecto y centrado
const classifyPlatform = (raw) => {
  if (!raw) return 'unknown';
  const s = String(raw).toLowerCase().trim();
  if (s.includes('whatsapp')) return 'whatsapp';
  if (s.includes('instagram')) return 'instagram';
  if (
    s.includes('facebook') ||
    s.includes('messenger') ||
    s.includes('fb_') ||
    s === 'fb'
  ) {
    return 'facebook';
  }
  return 'other';
};

const PlatformBadge = ({
  platform,
  size = 'md',
  className = '',
}) => {
  const kind = classifyPlatform(platform);
  // Configuramos dimensiones fijas para asegurar círculo perfecto y no deformable
  const dim =
    size === 'sm'
      ? 'w-[18px] h-[18px] text-[11px]'
      : 'w-[24px] h-[24px] text-[13px]';

  // Las siguientes reglas aseguran círculo perfecto, centrado y sin deformaciones:
  // w-[] h-[] rounded-full flex items-center justify-center shrink-0
  const baseBadge =
    `flex items-center justify-center rounded-full font-bold text-white shrink-0 box-border shadow-sm ${dim} ${className}`;

  if (kind === 'whatsapp') {
    return (
      <span
        title="WhatsApp"
        className={`bg-green-500 ${baseBadge}`}
        aria-hidden
      >
        W
      </span>
    );
  }
  if (kind === 'instagram') {
    return (
      <span
        title="Instagram"
        className={`bg-pink-500 ${baseBadge}`}
        aria-hidden
      >
        I
      </span>
    );
  }
  if (kind === 'facebook') {
    return (
      <span
        title="Facebook"
        className={`bg-blue-600 ${baseBadge}`}
        aria-hidden
      >
        {/* Usa la letra F como icono representativo */}
        F
      </span>
    );
  }
  return (
    <span
      title="Canal desconocido"
      className={`bg-gray-500 ${baseBadge}`}
      aria-hidden
    >
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
        {[
          { id: 'whatsapp', letter: 'W', className: 'bg-green-500' },
          { id: 'instagram', letter: 'I', className: 'bg-pink-500' },
          { id: 'facebook', letter: 'F', className: 'bg-blue-600' },
        ].map(({ id, letter, className }) => (
          <button
            key={id}
            type="button"
            title={id === 'whatsapp' ? 'WhatsApp' : id === 'instagram' ? 'Instagram' : 'Facebook'}
            onClick={() => setPlatformFilter((prev) => (prev === id ? 'all' : id))}
            className={`flex h-12 w-12 items-center justify-center rounded-full font-bold text-white shadow-lg transition hover:scale-105 ${className} ${
              platformFilter === id ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-105' : ''
            }`}
          >
            {letter}
          </button>
        ))}
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
              { id: 'facebook', label: 'Facebook' },
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
              <div className="relative shrink-0 h-12 w-12">
                <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-lg font-bold text-white shadow-md">
                  {contact.contactName ? contact.contactName.charAt(0).toUpperCase() : '?'}
                </div>
                <div className="pointer-events-none absolute bottom-[-1px] right-[-1px] z-[1] rounded-full shadow-sm ring-2 ring-white">
                  <PlatformBadge platform={contact.platform} size="sm" />
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
                <div className="relative h-9 w-9 shrink-0">
                  <div className="flex h-full w-full items-center justify-center rounded-full border border-blue-200 bg-blue-100 text-sm font-bold text-blue-600">
                    {selectedUserName?.charAt(0).toUpperCase()}
                  </div>
                  <div className="pointer-events-none absolute bottom-[-1px] right-[-1px] z-[1] rounded-full shadow-sm ring-2 ring-white">
                    <PlatformBadge platform={selectedContact?.platform} size="sm" />
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