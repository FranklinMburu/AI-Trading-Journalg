import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Send, X, Bot, Sparkles, Trash2, ArrowDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { generateContent, AI_MODELS } from '../services/aiService';
import ReactMarkdown from 'react-markdown';
import { collection, addDoc, query, where, orderBy, onSnapshot, getDocs, deleteDoc, doc, writeBatch, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

import { useAccount } from '../contexts/AccountContext';

export default function AIChatWidget() {
  const { activeAccount, selectedAccountId } = useAccount();
  const userId = activeAccount?.userId;
  const accountId = selectedAccountId;

  const [isOpen, setIsOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! I'm your TradeFlow assistant. How can I help you today?", timestamp: new Date().toISOString() }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<string | null>(null);
  const [globalContext, setGlobalContext] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load chat history from Firestore
  useEffect(() => {
    if (!userId) {
      // If no user, reset to default welcome message
      setMessages([{ role: 'assistant', content: "Hi! I'm your TradeFlow assistant. How can I help you today?", timestamp: new Date().toISOString() }]);
      return;
    }

    const q = query(
      collection(db, 'chat_history'),
      where('userId', '==', userId),
      orderBy('timestamp', 'asc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const loadedMessages = snapshot.docs.map(doc => ({
          role: doc.data().role,
          content: doc.data().content,
          timestamp: doc.data().timestamp
        } as Message));
        
        // Always ensure there is a welcome message if history is empty or at the start
        if (loadedMessages.length > 0) {
          setMessages(loadedMessages);
        }
      } else {
        // Default message for new users
        setMessages([{ role: 'assistant', content: "Hi! I'm your TradeFlow assistant. How can I help you today?", timestamp: new Date().toISOString() }]);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chat_history');
    });

    return () => unsubscribe();
  }, [userId]);

  useEffect(() => {
    // Handle specific, immediate context events (like clicking "Discuss with Nexus")
    const handleContextEvent = (e: any) => {
      const { message, context: newContext } = e.detail;
      setIsOpen(true);
      if (newContext) {
        setContext(newContext);
      }
      if (message) {
        setTimeout(() => {
          autoSend(message, newContext);
        }, 100);
      }
    };

    // Handle high-level environmental context (background awareness)
    const handleGlobalContextEvent = (e: any) => {
      const { source, data } = e.detail;
      if (source && data) {
        setGlobalContext(prev => ({
          ...prev,
          [source]: data
        }));
      }
    };

    window.addEventListener('nexus-chat-context', handleContextEvent);
    window.addEventListener('nexus-global-context', handleGlobalContextEvent);
    return () => {
      window.removeEventListener('nexus-chat-context', handleContextEvent);
      window.removeEventListener('nexus-global-context', handleGlobalContextEvent);
    };
  }, []);

  const getCombinedContext = () => {
    // Collect environmental signals
    const globalSignals = Object.entries(globalContext)
      .map(([source, data]) => `[${source.toUpperCase()} SIGNAL]\n${data}`)
      .join('\n\n');
    
    // Detailed account snapshot
    const accountState = activeAccount ? `
[ACTIVE ACCOUNT SNAPSHOT]
- Account Name: ${activeAccount.name}
- ID: ${activeAccount.id}
- Broker: ${activeAccount.broker || 'Manual/External'}
- Currency: ${activeAccount.currency}
- Balance: ${activeAccount.balance} (Real-time)
- Equity: ${activeAccount.equity} (Real-time)
- Last Sync: ${activeAccount.lastUpdate}
`.trim() : '[ACCOUNT SIGNAL]\nNo specific account is currently selected. User is looking at aggregate data or doesn\'t have an account yet.';

    return `
=== nexus intelligence context snapshot ===

USER IDENTITY:
- Auth ID: ${userId || 'Guest/Syncing'}
- Account ID: ${accountId || 'Unselected'}

${accountState}

REAL-TIME SYSTEM SIGNALS:
${globalSignals || 'User is currently exploring the landing page or main app shell.'}

ACTIVE SESSION CONTEXT:
${context || 'No deep-dive technical data (like a specific trade or strategy) is currently being scrutinized.'}

CONVERSATION SUMMARY (LATEST):
${messages.slice(-5).map(m => `${m.role.toUpperCase()}: ${m.content.substring(0, 150)}${m.content.length > 150 ? '...' : ''}`).join('\n')}

=== end context snapshot ===
`.trim();
  };

  const saveMessage = async (role: 'user' | 'assistant', content: string) => {
    if (!userId) {
      // For guest users, just update local state
      setMessages(prev => [...prev, { role, content, timestamp: new Date().toISOString() }]);
      return;
    }
    
    try {
      await addDoc(collection(db, 'chat_history'), {
        userId,
        role,
        content,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error saving message:', error);
    }
  };

  const clearHistory = async () => {
    if (!userId) {
      setMessages([{ role: 'assistant', content: "Local chat cleared.", timestamp: new Date().toISOString() }]);
      return;
    }

    if (!window.confirm('Clear your chat history permanentely?')) return;
    
    try {
      const q = query(collection(db, 'chat_history'), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      setMessages([{ role: 'assistant', content: "Chat history cleared. How can I help you again?", timestamp: new Date().toISOString() }]);
    } catch (error) {
      console.error('Error clearing history:', error);
      handleFirestoreError(error, OperationType.DELETE, 'chat_history');
    }
  };

  const autoSend = async (msg: string, ctx?: string) => {
    await saveMessage('user', msg);
    setLoading(true);
    try {
      const prompt = `
You are "Nexus", the advanced Neural Assistant for the TradeFlow ecosystem.
TradeFlow is a professional-grade trading journal and technical performance analysis platform.

=== OPERATIONAL CONTEXT ===
${getCombinedContext()}
${ctx ? `\n[IMMEDIATE DATA SIGNAL]\n${ctx}` : ''}

=== CORE MISSION ===
Analyze the provided CONTEXT SNAPSHOT, the IMMEDIATE DATA SIGNAL, and the AUTO-MSG to provide hyper-personalized insights.

=== CAPABILITIES & DIRECTIVES ===
1. CONTEXT AWARENESS: Use the provided signals to understand exactly what trade, strategy, or screen the user is focusing on right now.
2. ACTIONABLE INSIGHTS: Provide specific, technical feedback based on the data.
3. LIMITATIONS: Remind users you are an educational AI, not a licensed financial advisor.

=== TONE & STYLE ===
- Professional, technical, yet accessible.
- Sharp, data-driven insights.
- Short and punchy paragraphs.

AUTO-MSG: ${msg}
`.trim();

      const response = await generateContent({
        model: AI_MODELS.FLASH,
        contents: prompt
      });

      await saveMessage('assistant', response.text);
    } catch (error) {
      console.error('Auto Send Error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: "I encountered an error. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    await saveMessage('user', userMessage);
    setLoading(true);

    try {
      const prompt = `
You are "Nexus", the advanced Neural Assistant for the TradeFlow ecosystem.
TradeFlow is a professional-grade trading journal and technical performance analysis platform.

=== OPERATIONAL CONTEXT ===
${getCombinedContext()}

=== CORE MISSION ===
Analyze the provided CONTEXT SNAPSHOT and the USER QUESTION to provide hyper-personalized, context-aware assistance.

=== CAPABILITIES & DIRECTIVES ===
1. CONTEXT AWARENESS: You know exactly what tab the user is on, what account they are using, and their current system status. Mention specific details (e.g., "I see you're currently in the Risk Calculator...") when relevant to build trust and show awareness.
2. TECHNICAL ANALYSIS: You can explain complex trading concepts, risk management (R:R, Kelly Criterion), and technical setups.
3. PLATFORM NAVIGATION: Guide users to relevant tools based on their questions (e.g., "You can find your PnL breakdown in the Insights tab").
4. LIMITATIONS: Remind users you are an educational AI, not a licensed financial advisor. Do not promise guaranteed returns.

=== TONE & STYLE ===
- Professional, technical, yet accessible.
- Sharp, data-driven insights.
- Bullet points for clarity in complex explanations.
- Short and punchy paragraphs.

USER QUESTION: ${userMessage}
`.trim();

      const response = await generateContent({
        model: AI_MODELS.FLASH,
        contents: prompt
      });

      await saveMessage('assistant', response.text);
    } catch (error) {
      console.error('Chat Widget Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-[100]">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 20, scale: 0.95, filter: 'blur(10px)' }}
            className="mb-4 md:mb-6 flex h-[75vh] md:h-[600px] w-[calc(100vw-2rem)] sm:w-[450px] flex-col overflow-hidden rounded-[2rem] md:rounded-[2.5rem] border border-white/10 bg-zinc-950/80 shadow-[0_0_50px_rgba(0,0,0,0.5)] backdrop-blur-3xl"
          >
            {/* Header with AI Aura */}
            <div className="relative overflow-hidden border-b border-white/5 px-6 py-5">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-emerald-500/10 to-cyan-500/10 opacity-50" />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative flex h-10 w-10 items-center justify-center">
                    <div className="absolute inset-0 animate-spin-slow rounded-xl bg-gradient-to-tr from-indigo-500 via-emerald-400 to-cyan-400 blur-[2px]" />
                    <div className="relative flex h-full w-full items-center justify-center rounded-xl bg-zinc-950 text-white">
                      <Sparkles size={20} className="animate-pulse" />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-black tracking-tight text-white uppercase">Nexus Intelligence</h4>
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/80">Neural Link Active</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={clearHistory}
                    title="Clear history"
                    className="rounded-full bg-white/5 p-2 text-zinc-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                  >
                    <Trash2 size={18} />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-zinc-100 transition-all hover:bg-rose-500 hover:text-white active:scale-90 border border-white/5"
                    title="Close Assistant"
                  >
                    <X size={20} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div 
              className="relative flex-1 overflow-hidden"
            >
              <div 
                ref={scrollRef}
                className="h-full overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/5 hover:scrollbar-thumb-white/10 transition-colors"
                onScroll={(e) => {
                  const target = e.currentTarget;
                  const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
                  setAtBottom(isAtBottom);
                }}
              >
                {messages.map((msg, i) => (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={i}
                    className={cn(
                      "flex flex-col group/msg",
                      msg.role === 'user' ? "items-end" : "items-start"
                    )}
                  >
                    <div className={cn(
                      "relative max-w-[85%] rounded-[1.2rem] md:rounded-[1.5rem] p-3 md:p-4 text-xs md:text-sm shadow-sm transition-all",
                      msg.role === 'user'
                        ? "bg-gradient-to-br from-indigo-600 to-indigo-700 text-white font-medium rounded-tr-none border border-white/10"
                        : "bg-zinc-900 text-zinc-100 rounded-tl-none border border-white/5"
                    )}>
                      <div className="prose prose-invert prose-xs max-w-none break-words">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                    {msg.timestamp && (
                      <span className={cn(
                        "text-[8px] mt-1.5 font-mono uppercase tracking-tighter opacity-0 group-hover/msg:opacity-40 transition-opacity",
                        msg.role === 'user' ? "text-right mr-1" : "text-left ml-1"
                      )}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </motion.div>
                ))}
                
                {loading && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mr-auto"
                  >
                    <div className="flex h-10 w-16 items-center justify-center gap-1.5 rounded-[1.5rem] bg-zinc-900 border border-white/5 shadow-sm">
                      {[0, 1, 2].map((i) => (
                        <motion.div 
                          key={i}
                          animate={{ 
                            scale: [1, 1.2, 1],
                            opacity: [0.3, 1, 0.3]
                          }}
                          transition={{ 
                            duration: 1.5, 
                            repeat: Infinity, 
                            delay: i * 0.2,
                            ease: "easeInOut"
                          }}
                          className="h-1.5 w-1.5 rounded-full bg-emerald-500" 
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Scroll to bottom indicator */}
              <AnimatePresence>
                {!atBottom && messages.length > 3 && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    onClick={() => {
                      if (scrollRef.current) {
                        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
                      }
                    }}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-zinc-900/90 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white border border-white/10 backdrop-blur-md shadow-xl hover:bg-zinc-800"
                  >
                    <ArrowDown size={12} className="animate-bounce" />
                    Latest Messages
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Input Overlay */}
            <div className="p-4 md:p-6 bg-zinc-950/80 backdrop-blur-xl border-t border-white/5">
              <form onSubmit={handleSend} className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-emerald-500 to-cyan-500 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-500" />
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ask about TradeFlow..."
                    className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 md:px-6 py-3 md:py-4 pr-12 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-0 transition-all font-medium"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={loading}
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-white p-2 text-zinc-950 transition-all hover:scale-110 active:scale-95 disabled:opacity-50 disabled:grayscale shadow-lg shadow-white/10"
                  >
                    {loading ? (
                      <div className="flex gap-1 px-1">
                        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} className="h-1 w-1 rounded-full bg-zinc-950" />
                        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="h-1 w-1 rounded-full bg-zinc-950" />
                        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="h-1 w-1 rounded-full bg-zinc-950" />
                      </div>
                    ) : (
                      <Send size={18} />
                    )}
                  </button>
                </div>
              </form>
              <div className="mt-4 flex items-center justify-center gap-2">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">
                  Nexus v1.0 • Multi-Modal
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* World-Class AI Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="relative h-16 w-16 md:h-20 md:w-20"
      >
        {/* Futuristic Aura Layer 1: Ambient Glow */}
        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 via-emerald-500/20 to-cyan-500/20 rounded-[20px] md:rounded-[24px] blur-2xl md:blur-3xl" />
        
        {/* Futuristic Aura Layer 2: Pulse Aura */}
        <motion.div 
          animate={{ 
            opacity: [0.3, 0.6, 0.3],
            scale: [0.8, 1.2, 0.8]
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset--3 md:inset--4 bg-gradient-to-tr from-indigo-500/10 via-emerald-500/10 to-cyan-500/10 rounded-full blur-xl md:blur-2xl" 
        />
        
        {/* THE "BORDER BEAM" - Conic Shimmer Edge */}
        <div className="absolute inset-0 overflow-hidden rounded-[20px] md:rounded-[24px] p-[2px]">
          <div className="absolute inset-[-100%] animate-spin-slow bg-[conic-gradient(from_0deg,transparent_0,transparent_5%,var(--color-emerald-500)_15%,transparent_25%,transparent_45%,var(--color-indigo-500)_50%,transparent_60%,transparent_80%,var(--color-cyan-500)_90%,transparent_100%)] opacity-60" />
          
          {/* Main Button Body - Masked Inner */}
          <div className={cn(
            "relative flex h-full w-full items-center justify-center rounded-[18px] md:rounded-[22px] transition-all duration-700 overflow-hidden",
            isOpen ? "bg-zinc-900" : "bg-black"
          )}>
            {/* Holographic Internal Light Sweep */}
            <div className="absolute inset-0 z-0 overflow-hidden">
              <div className="absolute inset-0 bg-zinc-950/40" />
              <div className="absolute inset-y-0 -left-full w-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
            </div>
 
            <AnimatePresence mode="wait">
              {isOpen ? (
                <motion.div
                  key="close"
                  initial={{ opacity: 0, rotate: -180, scale: 0.5 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 180, scale: 0.5 }}
                  className="z-10"
                >
                  <X size={24} className="text-white/80" />
                </motion.div>
              ) : (
                <motion.div
                  key="open"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative z-10 flex items-center justify-center animate-nexus-pulse"
                >
                  <Sparkles className="size-8 md:size-9 text-white drop-shadow-[0_0_15px_rgba(16,185,129,0.8)]" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
 
        {/* AI Branding Label - Ultra-Premium Micro-Type */}
        <AnimatePresence>
          {!isOpen && (
            <motion.div
              initial={{ opacity: 0, x: 20, filter: 'blur(5px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 20, filter: 'blur(5px)' }}
              className="absolute -left-44 top-1/2 -translate-y-1/2 pointer-events-none hidden md:block"
            >
              <div className="px-4 py-2 rounded-full border border-white/[0.03] bg-black/80 backdrop-blur-xl shadow-2xl">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-2 w-2">
                    <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-20" />
                    <div className="relative h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]" />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/50 whitespace-nowrap">
                    Nexus Interface
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
