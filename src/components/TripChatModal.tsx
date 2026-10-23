import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, User, Shield, Truck, Clock } from 'lucide-react';
import { Trip, TripChatMessage } from '../types/fleet';
import { FleetBusinessEngine } from '../lib/enterprise/fleet_engine';

interface TripChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip | null;
  companyId: string;
  currentUser: {
    id: string;
    full_name?: string;
    role?: string;
  };
  isRtl: boolean;
}

export default function TripChatModal({
  isOpen,
  onClose,
  trip,
  companyId,
  currentUser,
  isRtl
}: TripChatModalProps) {
  if (!isOpen || !trip) return null;

  const [messages, setMessages] = useState<TripChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadMessages = () => {
    const msgs = FleetBusinessEngine.getTripChatMessages(companyId, trip.id);
    setMessages(msgs);
  };

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [companyId, trip.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    try {
      setSending(true);
      const isDriver = currentUser.full_name === trip.driver_id || currentUser.id === trip.driver_id;
      const role: 'DRIVER' | 'SUPERVISOR' | 'ADMIN' = isDriver ? 'DRIVER' : (currentUser.role === 'admin' ? 'ADMIN' : 'SUPERVISOR');

      await FleetBusinessEngine.sendTripChatMessage(
        companyId,
        trip.id,
        {
          id: currentUser.id,
          name: currentUser.full_name || 'User',
          role
        },
        inputText.trim()
      );

      setInputText('');
      loadMessages();
    } catch (err) {
      console.error('Failed to send trip chat message:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col h-[520px] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                  {isRtl ? 'شات المشوار الميداني' : 'Trip Operational Chat'}
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200">
                  {trip.tripType}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isRtl ? 'تواصل مباشر بين السائق والمشرف للمتابعة وتوجيهات الطريق' : 'Direct communication between driver & operations supervisor'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold p-1.5"
          >
            ✕
          </button>
        </div>

        {/* Driver & Trip Info Bar */}
        <div className="px-4 py-2 bg-indigo-50/40 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900/40 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2">
            <User className="h-3 w-3 text-indigo-500" />
            <span>{isRtl ? 'السائق:' : 'Driver:'} <strong>{trip.driver_id}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <Truck className="h-3 w-3 text-indigo-500" />
            <span>{isRtl ? 'المركبة:' : 'Vehicle:'} <strong>{trip.vehicle_id}</strong></span>
          </div>
        </div>

        {/* Message Area */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/30 dark:bg-slate-950/30">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs gap-1.5 text-center p-4">
              <MessageSquare className="h-8 w-8 text-slate-300 dark:text-slate-700" />
              <span>{isRtl ? 'لا توجد رسائل سابقة في هذا المشوار.' : 'No messages yet for this trip.'}</span>
              <span className="text-[11px] text-slate-500">{isRtl ? 'اكتب أول توجيه أو استفسار للسائق...' : 'Write the first dispatch instruction...'}</span>
            </div>
          ) : (
            messages.map(msg => {
              const isMe = msg.sender_id === currentUser.id;
              const isDriverMsg = msg.sender_role === 'DRIVER';

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">
                      {msg.sender_name}
                    </span>
                    <span className={`px-1.5 py-0.2 text-[9px] font-black rounded-md ${
                      isDriverMsg 
                        ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300' 
                        : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300'
                    }`}>
                      {isDriverMsg ? (isRtl ? 'سائق' : 'Driver') : (isRtl ? 'مشرف' : 'Ops')}
                    </span>
                  </div>

                  <div className={`p-3 rounded-2xl max-w-[85%] text-xs shadow-xs ${
                    isMe
                      ? 'bg-indigo-600 text-white rounded-br-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-bl-xs'
                  }`}>
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                    <div className={`text-[9px] mt-1 text-right font-mono ${
                      isMe ? 'text-indigo-200' : 'text-slate-400'
                    }`}>
                      {new Date(msg.created_at).toLocaleTimeString(isRtl ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder={isRtl ? 'اكتب رسالة أو توجيه للمشوار...' : 'Type dispatch instruction or update...'}
            className="flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || sending}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl shadow-sm transition-all"
          >
            <Send className={`h-4 w-4 ${isRtl ? 'rotate-180' : ''}`} />
          </button>
        </form>
      </div>
    </div>
  );
}
