import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, limit, getDocs, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Trade, UserSettings } from '../types';
import { GoogleGenAI, Type } from "@google/genai";
import { generateContent, getCache, setCache, isCacheValid, AI_MODELS } from '../services/aiService';
import { Brain, Sparkles, AlertTriangle, Lightbulb, RefreshCw, TrendingUp, TrendingDown, MessageSquare, Target, BarChart3, Fingerprint } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';

type AnalysisMode = 'GENERAL' | 'TRADE' | 'PERFORMANCE' | 'PATTERN' | 'STRATEGY';

export default function AIInsights({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<Record<string, string>>({});
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<Map<string, string>>(new Map());
  const [mode, setMode] = useState<AnalysisMode>('GENERAL');
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);

  useEffect(() => {
    const settingsQuery = query(collection(db, 'settings'), where('userId', '==', userId));
    const unsubscribeSettings = onSnapshot(settingsQuery, (snapshot) => {
      if (!snapshot.empty) setSettings(snapshot.docs[0].data() as UserSettings);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'settings');
    });

    const strategiesQuery = query(collection(db, 'strategies'), where('userId', '==', userId));
    const unsubscribeStrategies = onSnapshot(strategiesQuery, (snapshot) => {
      const sMap = new Map<string, string>();
      snapshot.docs.forEach(doc => sMap.set(doc.id, doc.data().name));
      setStrategies(sMap);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'strategies');
    });

    const tradesQuery = query(
      collection(db, 'trades'),
      where('userId', '==', userId),
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
  }, [userId]);

  const generateInsights = async (force = false) => {
    if (trades.length === 0) {
      setChatHistory([{ role: 'assistant', content: "I need at least a few closed trades to analyze your performance. Log some trades first!" }]);
      return;
    }

    const cacheKey = `all_insights_${userId}`;
    const cached = getCache(cacheKey);
    const contextHash = `${trades.length}_${trades[0]?.id}`;

    if (!force && isCacheValid(cached, 24 * 60 * 60 * 1000, contextHash)) {
      setInsights(cached?.data || {});
      if (cached?.data[mode]) {
        setChatHistory([{ role: 'assistant', content: cached.data[mode] }]);
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
        As a world-class trading performance analyst and coach, provide a comprehensive analysis of the following trade data across 5 distinct perspectives.
        
        Trade Data Summary:
        Winning Trades:
        ${winningTrades.map(formatTrade).join('\n')}
        Losing Trades:
        ${losingTrades.map(formatTrade).join('\n')}
        
        Please provide 5 distinct analyses:
        1. GENERAL: Overall performance briefing, win rate, profit factor, and edge.
        2. TRADE: Critique of execution quality, risk adherence, and psychological biases in recent trades.
        3. PERFORMANCE: Statistical commonalities in wins vs losses, R/R profile, and behavioral consistency.
        4. PATTERN: Detection of cognitive biases (FOMO, revenge trading), directional bias, and risk consistency.
        5. STRATEGY: Optimization audit, ranking strategies, identifying "leaks", and scaling refinements.
        
        Return as a JSON object where keys are the modes (GENERAL, TRADE, PERFORMANCE, PATTERN, STRATEGY) and values are Markdown strings.
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
  };

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
    generateInsights();
  }, [trades.length, userId]);

  useEffect(() => {
    if (insights[mode]) {
      setChatHistory([{ role: 'assistant', content: insights[mode] }]);
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
                </div>
              ))}

              {loading && (
                <div className="mr-auto bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-4 flex items-center gap-3">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
                  <span className="text-xs text-zinc-400">Thinking...</span>
                </div>
              )}
            </div>

            <form onSubmit={handleChat} className="relative">
              <input
                type="text"
                placeholder="Ask me anything about your trading..."
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 pr-12 text-sm focus:border-purple-500 focus:outline-none transition-all"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={loading}
              />
              <button 
                type="submit"
                disabled={loading || !chatInput.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-purple-500 p-2 text-white transition-all hover:bg-purple-400 disabled:opacity-50"
              >
                <RefreshCw size={16} className={cn(loading && "animate-spin")} />
              </button>
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
