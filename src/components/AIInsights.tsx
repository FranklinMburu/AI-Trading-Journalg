import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, limit, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Trade, UserSettings } from '../types';
import { GoogleGenAI } from '@google/genai';
import { Brain, Sparkles, AlertTriangle, Lightbulb, RefreshCw, TrendingUp, TrendingDown, MessageSquare, Target, BarChart3, Fingerprint } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';

type AnalysisMode = 'GENERAL' | 'TRADE' | 'PERFORMANCE' | 'PATTERN';

export default function AIInsights({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<string | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [mode, setMode] = useState<AnalysisMode>('GENERAL');
  const [settings, setSettings] = useState<UserSettings | null>(null);

  useEffect(() => {
    const settingsQuery = query(collection(db, 'settings'), where('userId', '==', userId));
    const unsubscribeSettings = onSnapshot(settingsQuery, (snapshot) => {
      if (!snapshot.empty) setSettings(snapshot.docs[0].data() as UserSettings);
    });

    const tradesQuery = query(
      collection(db, 'trades'),
      where('userId', '==', userId),
      where('status', '==', 'CLOSED'),
      orderBy('entryTime', 'desc'),
      limit(50)
    );

    const unsubscribeTrades = onSnapshot(tradesQuery, (snapshot) => {
      setTrades(snapshot.docs.map(doc => doc.data() as Trade));
    });

    return () => {
      unsubscribeSettings();
      unsubscribeTrades();
    };
  }, [userId]);

  const generateInsights = async (selectedMode: AnalysisMode = mode) => {
    setLoading(true);
    try {
      if (trades.length === 0) {
        setInsights("I need at least a few closed trades to analyze your performance. Log some trades first!");
        setLoading(false);
        return;
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      let prompt = '';

      const winningTrades = trades.filter(t => (t.pnl || 0) > 0).slice(0, 10);
      const losingTrades = trades.filter(t => (t.pnl || 0) < 0).slice(0, 10);

      const formatTrade = (t: Trade) => 
        `- ${t.symbol} ${t.direction}: Entry ${t.entryPrice}, Exit ${t.exitPrice}, PnL ${t.pnl || 0}. SL: ${t.stopLoss || 'N/A'}, TP: ${t.takeProfit || 'N/A'}. Notes: ${t.notes || 'N/A'}`;

      if (selectedMode === 'GENERAL') {
        prompt = `
          You are a trading assistant.
          Context:
          - User Currency: ${settings?.currency || 'USD'}
          - Last 5 wins:
          ${winningTrades.slice(0, 5).map(formatTrade).join('\n')}
          - Last 5 losses:
          ${losingTrades.slice(0, 5).map(formatTrade).join('\n')}

          Task: Provide a high-level summary of recent performance. Be encouraging but objective.
        `;
      } else if (selectedMode === 'TRADE') {
        const latestTrade = trades[0];
        prompt = `
          You are a trade auditor. Analyze this specific trade:
          ${formatTrade(latestTrade)}

          Output:
          1. Execution critique (entry/exit timing).
          2. Risk adherence (did they use SL/TP effectively?).
          3. Psychological bias detection (FOMO, revenge, etc. based on notes).
        `;
      } else if (selectedMode === 'PERFORMANCE') {
        prompt = `
          You are a performance analyst. Compare these 10 wins and 10 losses:
          Wins:
          ${winningTrades.map(formatTrade).join('\n')}
          Losses:
          ${losingTrades.map(formatTrade).join('\n')}

          Output:
          1. Pattern comparison (what's common in wins vs losses?).
          2. Winning vs losing behavior (holding time, size, etc.).
          3. 5 actionable improvements.
        `;
      } else if (selectedMode === 'PATTERN') {
        prompt = `
          You are a behavioral psychologist for traders. Detect biases in these trades:
          ${trades.map(formatTrade).join('\n')}

          Detect:
          1. Pair bias (do they lose more on specific pairs?).
          2. Direction bias (better at Longs or Shorts?).
          3. Time patterns (day of week/time of day).
          4. Risk consistency.
          5. Psychological errors (FOMO, revenge, loss aversion).
        `;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      setInsights(response.text);
    } catch (error) {
      console.error('Error generating insights:', error);
      setInsights("Failed to generate insights. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (trades.length > 0) generateInsights();
  }, [mode, trades.length === 0]);

  const modes = [
    { id: 'GENERAL', label: 'General Chat', icon: MessageSquare, desc: 'Overview of recent wins/losses' },
    { id: 'TRADE', label: 'Trade Analysis', icon: Target, desc: 'Critique of your latest trade' },
    { id: 'PERFORMANCE', label: 'Deep Performance', icon: BarChart3, desc: 'Win/Loss behavior comparison' },
    { id: 'PATTERN', label: 'Pattern Analysis', icon: Fingerprint, desc: 'Detecting biases and errors' },
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
          onClick={() => generateInsights()}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
        >
          <RefreshCw size={16} className={cn(loading && "animate-spin")} />
          Refresh Analysis
        </button>
      </div>

      {/* Mode Selector */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              setMode(m.id as AnalysisMode);
              setInsights(null);
            }}
            className={cn(
              "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all",
              mode === m.id 
                ? "border-purple-500 bg-purple-500/5 ring-1 ring-purple-500" 
                : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
            )}
          >
            <div className={cn(
              "rounded-lg p-2",
              mode === m.id ? "bg-purple-500 text-white" : "bg-zinc-800 text-zinc-400"
            )}>
              <m.icon size={18} />
            </div>
            <div>
              <p className="text-sm font-bold">{m.label}</p>
              <p className="text-[10px] text-zinc-500 leading-tight">{m.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="relative">
              <div className="h-16 w-16 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
              <Sparkles className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-purple-500" size={24} />
            </div>
            <p className="text-zinc-400 animate-pulse">Assistant is thinking...</p>
          </div>
        ) : insights ? (
          <div className="prose prose-invert max-w-none">
            <div className="markdown-body">
              <ReactMarkdown>{insights}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <AlertTriangle size={48} className="mb-4 opacity-20" />
            <p>Select a mode to begin analysis.</p>
          </div>
        )}
      </div>
    </div>
  );
}
