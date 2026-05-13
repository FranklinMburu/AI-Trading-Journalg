import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, orderBy, limit, getDocs, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Trade, UserSettings } from '../types';
import { GoogleGenAI, Type } from "@google/genai";
import { generateContent, getCache, setCache, isCacheValid, AI_MODELS } from '../services/aiService';
import { Brain, Sparkles, AlertTriangle, Lightbulb, RefreshCw, TrendingUp, TrendingDown, MessageSquare, Target, BarChart3, Fingerprint, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';

type AnalysisMode = 'GENERAL' | 'TRADE' | 'PERFORMANCE' | 'PATTERN' | 'STRATEGY';

import { useAccount } from '../contexts/AccountContext';

export default function AIInsights() {
  const { activeAccount, selectedAccountId, isDemoMode } = useAccount();
  const userId = activeAccount?.userId;
  const accountId = selectedAccountId;

  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<Record<string, string>>({});
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<Map<string, string>>(new Map());
  const [mode, setMode] = useState<AnalysisMode>('GENERAL');
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);

  useEffect(() => {
    if (!userId || !accountId) return;

    const settingsQuery = query(collection(db, 'users', userId, 'accounts', accountId, 'settings'));
    const unsubscribeSettings = onSnapshot(settingsQuery, (snapshot) => {
      if (!snapshot.empty) setSettings(snapshot.docs[0].data() as UserSettings);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'settings');
    });

    const strategiesQuery = query(
      collection(db, 'users', userId, 'accounts', accountId, 'strategies'), 
      where('isDemo', '==', isDemoMode)
    );
    const unsubscribeStrategies = onSnapshot(strategiesQuery, (snapshot) => {
      const sMap = new Map<string, string>();
      snapshot.docs.forEach(doc => sMap.set(doc.id, doc.data().name));
      setStrategies(sMap);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'strategies');
    });

    const tradesQuery = query(
      collection(db, 'users', userId, 'accounts', accountId, 'trades'),
      where('isDemo', '==', isDemoMode),
      where('status', '==', 'CLOSED'),
      orderBy('entryTime', 'desc'),
      limit(50)
    );

    const unsubscribeTrades = onSnapshot(tradesQuery, (snapshot) => {
      setTrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trade)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trades');
    });

    return () => {
      unsubscribeSettings();
      unsubscribeStrategies();
      unsubscribeTrades();
    };
  }, [userId, accountId, isDemoMode]);

  const lastInsightsRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (insights[mode] && insights[mode] !== lastInsightsRef.current) {
      lastInsightsRef.current = insights[mode];
      const timer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('nexus-global-context', {
          detail: {
            source: `AI Insights (${mode})`,
            data: `Currently viewing AI analysis for ${mode}: ${insights[mode].substring(0, 300)}...`
          }
        }));
      }, 1000); // Debounce context updates
      return () => clearTimeout(timer);
    }
  }, [insights, mode]);

  const generateInsights = React.useCallback(async (force = false) => {
    if (!trades || trades.length === 0) {
      setChatHistory([{ role: 'assistant', content: "I need at least a few closed trades to analyze your performance. Log some trades first!" }]);
      return;
    }

    const cacheKey = `all_insights_${userId}`;
    const cached = getCache(cacheKey);
    const contextHash = `${trades.length}_${trades[0]?.id}`;

    if (!force && isCacheValid(cached, 24 * 60 * 60 * 1000, contextHash)) {
      const data = cached?.data || {};
      setInsights(data);
      if (data[mode]) {
        setChatHistory(prev => {
          if (prev.length === 1 && prev[0].content === data[mode]) return prev;
          return [{ role: 'assistant', content: data[mode] }];
        });
      }
      return;
    }

    setLoading(true);
    try {
      const winningTrades = trades.filter(t => (t.pnl || 0) > 0).slice(0, 15);
      const losingTrades = trades.filter(t => (t.pnl || 0) < 0).slice(0, 15);

      const formatTrade = (t: Trade) => {
        const strategyName = t.strategyId ? strategies.get(t.strategyId) || 'Unknown' : 'Unassigned';
        return `- ${t.symbol} ${t.direction}: PnL ${t.pnl || 0}. Strategy: ${strategyName}. Notes: ${t.notes || 'N/A'}`;
      };

      const prompt = `
        As a world-class trading performance analyst and senior hedge fund coach, provide a deep, data-driven audit of the following trade history. Your goal is to identify specific behavioral leaks, technical flaws, and optimization opportunities.
        
        Trade Data Summary (Last 50 trades):
        Winning Trades:
        ${winningTrades.map(formatTrade).join('\n')}
        Losing Trades:
        ${losingTrades.map(formatTrade).join('\n')}
        
        Please provide 5 distinct, highly actionable analyses:
        
        1. **GENERAL**: Provide a "State of the Journal" executive summary. Calculate the actual win rate and profit factor from the provided data. Identify the primary "Edge" (e.g., "High RR on XAUUSD shorts").
        
        2. **TRADE**: Critique the execution quality. Look for signs of "Note Quality" (are notes descriptive or emotional?). Identify if the user is holding losers too long or cutting winners early based on the PnL distribution.
        
        3. **PERFORMANCE**: Statistical deep-dive. Compare the average win vs average loss. Identify the "Best Performing Strategy" and "Worst Performing Strategy". Highlight any specific symbols or directions (Long/Short) that are draining the account.
        
        4. **PATTERN**: Detection of cognitive and behavioral biases. Look for "Revenge Trading" (clusters of losses in a short time), "FOMO" (entries with poor rationale), or "Risk Creep" (increasing quantity after losses).
        
        5. **STRATEGY**: Optimization audit. For each strategy identified, provide one specific technical refinement (e.g., "Tighten stops on Breakout trades by 10%"). Identify which strategy should be "Scaled" and which should be "Benched".
        
        Return as a JSON object where keys are the modes (GENERAL, TRADE, PERFORMANCE, PATTERN, STRATEGY) and values are professional Markdown strings with clear headings and bullet points.
      `;

      const response = await generateContent({
        model: AI_MODELS.FLASH,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              GENERAL: { type: Type.STRING },
              TRADE: { type: Type.STRING },
              PERFORMANCE: { type: Type.STRING },
              PATTERN: { type: Type.STRING },
              STRATEGY: { type: Type.STRING }
            },
            required: ['GENERAL', 'TRADE', 'PERFORMANCE', 'PATTERN', 'STRATEGY']
          }
        }
      });

      const data = JSON.parse(response.text);
      setInsights(data);
      setCache(cacheKey, data, contextHash);
      if (data[mode]) {
        setChatHistory([{ role: 'assistant', content: data[mode] }]);
      }
    } catch (error) {
      console.error('Error generating insights:', error);
      setChatHistory([{ role: 'assistant', content: "Failed to generate insights. Please try again later." }]);
    } finally {
      setLoading(false);
    }
  }, [userId, trades, strategies, mode]);

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || loading) return;

    const userMsg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const context = `
        You are a professional trading coach. 
        User's recent trades:
        ${trades.slice(0, 20).map(t => `- ${t.symbol} ${t.direction}: PnL ${t.pnl || 0}, Notes: ${t.notes || 'N/A'}`).join('\n')}
        
        User's question: ${userMsg}
        
        Provide a helpful, data-driven response based on their trading history.
      `;

      const response = await generateContent({
        model: AI_MODELS.FLASH,
        contents: context
      });
      setChatHistory(prev => [...prev, { role: 'assistant', content: response.text }]);
    } catch (err) {
      console.error('Chat error:', err);
      setChatHistory(prev => [...prev, { role: 'assistant', content: "I'm sorry, I encountered an error processing your request." }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (trades.length > 0 && userId) {
      generateInsights();
    }
  }, [trades.length, userId, generateInsights]);

  useEffect(() => {
    if (insights[mode]) {
      setChatHistory(prev => {
        if (prev.length === 1 && prev[0].content === insights[mode]) return prev;
        return [{ role: 'assistant', content: insights[mode] }];
      });
    }
  }, [mode, insights]);

  const modes = [
    { id: 'GENERAL', label: 'General Chat', icon: MessageSquare, desc: 'Overview of recent wins/losses' },
    { id: 'TRADE', label: 'Trade Analysis', icon: Target, desc: 'Critique of your latest trade' },
    { id: 'PERFORMANCE', label: 'Deep Performance', icon: BarChart3, desc: 'Win/Loss behavior comparison' },
    { id: 'PATTERN', label: 'Pattern Analysis', icon: Fingerprint, desc: 'Detecting biases and errors' },
    { id: 'STRATEGY', label: 'Strategy Audit', icon: Target, desc: 'Optimizing your trading systems' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500">
            <Brain size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold">AI Trading Assistant</h3>
            <p className="text-sm text-zinc-400">Advanced intelligence for your trading journey</p>
          </div>
        </div>
        <button 
          onClick={() => generateInsights(true)}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
        >
          <RefreshCw size={16} className={cn(loading && "animate-spin")} />
          Refresh Analysis
        </button>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Chat/Insights Area */}
        <div className="flex-1 space-y-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm min-h-[400px] flex flex-col">
            <div className="flex-1 overflow-y-auto space-y-4 mb-6">
              {chatHistory.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                  <Sparkles size={48} className="mb-4 opacity-20" />
                  <p>Select a mode or ask a question to begin.</p>
                </div>
              )}
              
              {chatHistory.map((msg, i) => (
                <div key={i} className={cn(
                  "flex flex-col max-w-[85%] rounded-2xl p-4",
                  msg.role === 'user' 
                    ? "ml-auto bg-emerald-500/10 border border-emerald-500/20 text-emerald-50" 
                    : "mr-auto bg-zinc-800/50 border border-zinc-700/50 text-zinc-100"
                )}>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.role === 'assistant' && i === chatHistory.length - 1 && !loading && (
                    <button
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('nexus-chat-context', {
                          detail: {
                            message: "Can you help me understand this insight better?",
                            context: `
                              Active Analysis Mode: ${mode}
                              Recent Data Context: ${trades.length} trades analyzed.
                              Insight content: ${msg.content}
                            `.trim()
                          }
                        }));
                      }}
                      className="mt-4 flex items-center gap-2 self-end rounded-lg bg-zinc-950 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 border border-white/5 hover:bg-zinc-900 transition-all group"
                    >
                      <Sparkles size={10} className="text-emerald-500 group-hover:scale-125 transition-transform" />
                      Discuss with Nexus
                    </button>
                  )}
                </div>
              ))}

              {loading && (
                <div className="mr-auto">
                  <div className="flex h-10 w-14 items-center justify-center gap-1 rounded-[1.5rem] bg-zinc-900 border border-white/5 shadow-sm">
                    <motion.span 
                      animate={{ scale: [1, 1.5, 1] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                      className="h-1.5 w-1.5 rounded-full bg-indigo-500" 
                    />
                    <motion.span 
                      animate={{ scale: [1, 1.5, 1] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                      className="h-1.5 w-1.5 rounded-full bg-emerald-500" 
                    />
                    <motion.span 
                      animate={{ scale: [1, 1.5, 1] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                      className="h-1.5 w-1.5 rounded-full bg-cyan-500" 
                    />
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleChat} className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-emerald-500 to-cyan-500 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-500" />
              <div className="relative">
                <input
                  type="text"
                  placeholder="Ask me anything about your trading..."
                  className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-6 py-4 pr-12 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-0 transition-all font-medium"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={loading}
                />
                <button 
                  type="submit"
                  disabled={loading || !chatInput.trim()}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl bg-white p-2 text-zinc-950 transition-all hover:scale-110 active:scale-95 disabled:opacity-50 disabled:grayscale"
                >
                  <Send size={18} />
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Sidebar Modes */}
        <div className="w-full lg:w-80 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 px-2">Analysis Modes</h4>
          <div className="grid grid-cols-1 gap-3">
            {modes.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setMode(m.id as AnalysisMode);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                  mode === m.id 
                    ? "border-purple-500 bg-purple-500/5 ring-1 ring-purple-500" 
                    : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                )}
              >
                <div className={cn(
                  "rounded-lg p-2",
                  mode === m.id ? "bg-purple-500 text-white" : "bg-zinc-800 text-zinc-400"
                )}>
                  <m.icon size={16} />
                </div>
                <div>
                  <p className="text-xs font-bold">{m.label}</p>
                  <p className="text-[10px] text-zinc-500 leading-tight">{m.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
