import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, onSnapshot, getDocs, addDoc, updateDoc, doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Trade, Strategy } from '../types';
import { formatCurrency, formatPercent, cn } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, LineChart, Line, Legend } from 'recharts';
import { Target, TrendingUp, AlertCircle, Plus, Save, X, Activity, CheckSquare, Square, BookOpen, Database, Sparkles } from 'lucide-react';
import Markdown from 'react-markdown';
import { GoogleGenAI, Type } from "@google/genai";
import { generateContent, getCache, setCache, isCacheValid, AI_MODELS } from '../services/aiService';

interface StrategyStats {
  id: string;
  name: string;
  rules: string;
  totalPnL: number;
  winRate: number;
  profitFactor: number;
  tradeCount: number;
  avgPnL: number;
  equityCurve: { tradeIndex: number; cumulativePnL: number; time?: string }[];
  tradePnLs: { tradeIndex: number; pnl: number; symbol: string; time: string }[];
  createdAt: string;
}

interface BacktestResult {
  strategyName: string;
  totalPnL: number;
  winRate: number;
  profitFactor: number;
  tradeCount: number;
  equityCurve: { tradeIndex: number; cumulativePnL: number; time: string }[];
  trades: Trade[];
}

import { useAccount } from '../contexts/AccountContext';

export default function StrategyAnalysis() {
  const { activeAccount, selectedAccountId, isDemoMode, user } = useAccount();
  const userId = user?.uid;
  const accountId = selectedAccountId;

  const [loading, setLoading] = useState(true);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newStrategyName, setNewStrategyName] = useState('');
  const [newStrategyRules, setNewStrategyRules] = useState('');
  const [newStrategyNotes, setNewStrategyNotes] = useState('');
  const [manualTradeIds, setManualTradeIds] = useState('');
  const [selectedTradeIds, setSelectedTradeIds] = useState<Set<string>>(new Set());
  const [viewingStrategy, setViewingStrategy] = useState<StrategyStats | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [backtestStrategyId, setBacktestStrategyId] = useState('');
  const [backtestStartDate, setBacktestStartDate] = useState('');
  const [backtestEndDate, setBacktestEndDate] = useState('');
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isRunningBacktest, setIsRunningBacktest] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // AI Global Context Heartbeat - Strategy Analysis
  useEffect(() => {
    if (viewingStrategy) {
      window.dispatchEvent(new CustomEvent('nexus-global-context', {
        detail: {
          source: 'Strategy Overview',
          data: `User is analyzing strategy "${viewingStrategy.name}". Stats: Win Rate ${formatPercent(viewingStrategy.winRate)}, Profit Factor ${viewingStrategy.profitFactor.toFixed(2)}, Total Trades ${viewingStrategy.tradeCount}. Account: ${accountId || 'All'}.`
        }
      }));
    } else if (backtestResult) {
       window.dispatchEvent(new CustomEvent('nexus-global-context', {
        detail: {
          source: 'Backtest Result',
          data: `User just ran a backtest for "${backtestResult.strategyName}". Result: PnL ${formatCurrency(backtestResult.totalPnL)}, Win Rate ${formatPercent(backtestResult.winRate)}, Profit Factor ${backtestResult.profitFactor.toFixed(2)}. Account: ${accountId || 'All'}.`
        }
      }));
    }
  }, [viewingStrategy, backtestResult, accountId]);

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleAddStrategy = async () => {
    if (!newStrategyName.trim() || !userId || !accountId) return;
    try {
      const strategyRef = await addDoc(collection(db, 'users', userId, 'accounts', accountId, 'strategies'), {
        userId,
        name: newStrategyName,
        rules: newStrategyRules,
        notes: newStrategyNotes,
        createdAt: new Date().toISOString(),
        isDemo: isDemoMode
      });

      // Update associated trades
      const allSelectedIds = new Set(selectedTradeIds);
      if (manualTradeIds.trim()) {
        manualTradeIds.split(',').forEach(id => {
          const trimmed = id.trim();
          if (trimmed) allSelectedIds.add(trimmed);
        });
      }

      if (allSelectedIds.size > 0) {
        const updatePromises = Array.from(allSelectedIds).map(tradeId => 
          updateDoc(doc(db, 'users', userId, 'accounts', accountId, 'trades', tradeId), { strategyId: strategyRef.id })
        );
        await Promise.all(updatePromises);
      }

      setNewStrategyName('');
      setNewStrategyRules('');
      setNewStrategyNotes('');
      setManualTradeIds('');
      setSelectedTradeIds(new Set());
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'strategies');
    }
  };

  const handleSeedXAUUSDData = async () => {
    const effectiveUserId = user?.uid || userId;
    let effectiveAccountId = accountId;

    if (!effectiveUserId || isSeeding) return;
    setIsSeeding(true);

    try {
      // If no account exists, create one first or use a deterministic ID for demo
      const demoAccountDocId = 'DEMO_001';
      if (!effectiveAccountId) {
        await setDoc(doc(db, 'users', effectiveUserId, 'accounts', demoAccountDocId), {
          userId: effectiveUserId,
          accountNumber: 'DEMO-001',
          name: 'Demo Trading Account',
          currency: 'USD',
          broker: 'Demo',
          balance: 10000,
          equity: 10000,
          createdAt: new Date().toISOString(),
          lastUpdate: new Date().toISOString()
        });
        effectiveAccountId = demoAccountDocId;
      }

      const response = await generateContent({
        model: AI_MODELS.FLASH,
        contents: "Generate 10 realistic XAU/USD trades for the past month (Feb 21 - Mar 21, 2026). Use real historical prices from Google Search. Return a JSON array of objects with: symbol, entryPrice, exitPrice, quantity (0.1-1.0), direction (LONG/SHORT), status (CLOSED), pnl, entryTime (ISO), exitTime (ISO), and brief notes on market rationale. Today is March 21, 2026.",
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                symbol: { type: Type.STRING },
                entryPrice: { type: Type.NUMBER },
                exitPrice: { type: Type.NUMBER },
                quantity: { type: Type.NUMBER },
                direction: { type: Type.STRING, enum: ['LONG', 'SHORT'] },
                status: { type: Type.STRING, enum: ['CLOSED'] },
                pnl: { type: Type.NUMBER },
                entryTime: { type: Type.STRING },
                exitTime: { type: Type.STRING },
                notes: { type: Type.STRING }
              },
              required: ['symbol', 'entryPrice', 'exitPrice', 'quantity', 'direction', 'status', 'pnl', 'entryTime', 'exitTime', 'notes']
            }
          },
          tools: [{ googleSearch: {} }]
        },
      });

      if (!response.text) {
        throw new Error("Empty response from AI for seeding.");
      }

      let trades;
      try {
        const cleanedText = response.text.replace(/```json\n?|\n?```/g, '').trim();
        trades = JSON.parse(cleanedText);
      } catch (parseError) {
        console.error("Failed to parse AI response as JSON:", response.text);
        throw new Error("Failed to parse sample data. Please try again.");
      }

      if (!Array.isArray(trades)) {
         throw new Error("Invalid format returned from AI.");
      }

      // Create a strategy for these trades
      const strategyRef = await addDoc(collection(db, 'users', effectiveUserId, 'accounts', effectiveAccountId, 'strategies'), {
        userId: effectiveUserId,
        name: 'XAU/USD Trend Following',
        rules: '1. Identify trend on Daily chart.\n2. Enter on 4H pullback to 20 EMA.\n3. Stop loss below recent swing low.\n4. Take profit at 2:1 Reward:Risk.',
        notes: 'Seeded historical data for XAU/USD performance analysis.',
        createdAt: new Date().toISOString(),
        isDemo: true
      });

      // Add trades to Firestore
      const tradePromises = trades.map((trade: any) => 
        addDoc(collection(db, 'users', effectiveUserId, 'accounts', effectiveAccountId, 'trades'), {
          ...trade,
          userId: effectiveUserId,
          strategyId: strategyRef.id,
          isDemo: true
        })
      );

      await Promise.all(tradePromises);
      alert('Successfully seeded XAU/USD trades for the last month!');
    } catch (error: any) {
      console.error('Seeding error:', error);
      alert(`Failed to generate sample data: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSeeding(false);
    }
  };

  const toggleTradeSelection = (tradeId: string) => {
    const next = new Set(selectedTradeIds);
    if (next.has(tradeId)) {
      next.delete(tradeId);
    } else {
      next.add(tradeId);
    }
    setSelectedTradeIds(next);
  };

  const [rawTrades, setRawTrades] = useState<Trade[]>([]);
  const [strategiesMap, setStrategiesMap] = useState<Map<string, { name: string; createdAt: string; rules: string }>>(new Map());

  useEffect(() => {
    if (!userId || !accountId) return;

    const q = accountId?.startsWith('DEMO_')
      ? query(
          collection(db, 'users', userId, 'accounts', accountId, 'strategies'), 
          where('isDemo', '==', isDemoMode)
        )
      : query(
          collection(db, 'users', userId, 'accounts', accountId, 'strategies')
        );
    return onSnapshot(q, (snapshot) => {
      const sMap = new Map<string, { name: string; createdAt: string; rules: string }>();
      snapshot.docs.forEach(doc => {
        const data = doc.data() as Strategy;
        sMap.set(doc.id, { 
          name: data.name, 
          createdAt: data.createdAt || new Date(0).toISOString(),
          rules: data.rules || ''
        });
      });
      setStrategiesMap(sMap);
      setIsDataLoaded(true);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'strategies');
      setIsDataLoaded(true);
    });
  }, [userId, accountId, isDemoMode]);

  useEffect(() => {
    if (!userId || !accountId) return;

    const q = accountId?.startsWith('DEMO_')
      ? query(
          collection(db, 'users', userId, 'accounts', accountId, 'trades'), 
          where('isDemo', '==', isDemoMode)
        )
      : query(
          collection(db, 'users', userId, 'accounts', accountId, 'trades')
        );
    return onSnapshot(q, (snapshot) => {
      setRawTrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trade)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trades');
      setLoading(false);
    });
  }, [userId, accountId, isDemoMode]);

  const stats = React.useMemo(() => {
    if (!isDataLoaded && rawTrades.length === 0) return [];

    const closedTrades = rawTrades.filter(t => t.status === 'CLOSED').sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

    const strategyGroups = new Map<string, Trade[]>();
    closedTrades.forEach(trade => {
      const sId = trade.strategyId || 'unassigned';
      if (!strategyGroups.has(sId)) strategyGroups.set(sId, []);
      strategyGroups.get(sId)!.push(trade);
    });

    const calculatedStats: StrategyStats[] = [];
    strategyGroups.forEach((trades, sId) => {
      const totalPnL = trades.reduce((acc, t) => acc + (t.pnl || 0), 0);
      const wins = trades.filter(t => (t.pnl || 0) > 0).length;
      const winRate = trades.length > 0 ? wins / trades.length : 0;
      
      const grossProfits = trades.filter(t => (t.pnl || 0) > 0).reduce((acc, t) => acc + (t.pnl || 0), 0);
      const grossLosses = Math.abs(trades.filter(t => (t.pnl || 0) < 0).reduce((acc, t) => acc + (t.pnl || 0), 0));
      const profitFactor = grossLosses === 0 ? (grossProfits > 0 ? grossProfits : 0) : grossProfits / grossLosses;

      let cumulative = 0;
      const equityCurve = trades.map((t, index) => {
        cumulative += (t.pnl || 0);
        return { tradeIndex: index + 1, cumulativePnL: cumulative, time: t.entryTime };
      });

      const tradePnLs = trades.map((t, index) => ({
        tradeIndex: index + 1,
        pnl: t.pnl || 0,
        symbol: t.symbol,
        time: t.entryTime
      }));

      equityCurve.unshift({ tradeIndex: 0, cumulativePnL: 0, time: trades[0]?.entryTime || '' });
      
      const strategyInfo = strategiesMap.get(sId);
      calculatedStats.push({
        id: sId,
        name: sId === 'unassigned' ? 'No Strategy' : (strategyInfo?.name || 'Unknown Strategy'),
        rules: strategyInfo?.rules || '',
        totalPnL,
        winRate,
        profitFactor,
        tradeCount: trades.length,
        avgPnL: trades.length > 0 ? totalPnL / trades.length : 0,
        equityCurve,
        tradePnLs,
        createdAt: sId === 'unassigned' ? new Date(0).toISOString() : (strategyInfo?.createdAt || new Date(0).toISOString())
      });
    });

    return calculatedStats.sort((a, b) => b.totalPnL - a.totalPnL);
  }, [rawTrades, strategiesMap, isDataLoaded]);

  const unassignedTrades = React.useMemo(() => {
    return rawTrades.filter(t => !t.strategyId || t.strategyId === 'unassigned');
  }, [rawTrades]);

  const filteredStats = stats.filter(s => {
    const matchesName = s.name.toLowerCase().includes(searchTerm.toLowerCase());
    const strategyDate = new Date(s.createdAt);
    const matchesStartDate = !startDate || strategyDate >= new Date(startDate);
    const matchesEndDate = !endDate || strategyDate <= new Date(endDate + 'T23:59:59');
    return matchesName && matchesStartDate && matchesEndDate;
  });

  const handleRunBacktest = () => {
    if (!backtestStrategyId) return;
    setIsRunningBacktest(true);
    
    setTimeout(() => {
      const strategyTrades = rawTrades.filter(t => 
        t.strategyId === backtestStrategyId && 
        t.status === 'CLOSED' &&
        (!backtestStartDate || new Date(t.entryTime) >= new Date(backtestStartDate)) &&
        (!backtestEndDate || new Date(t.entryTime) <= new Date(backtestEndDate + 'T23:59:59'))
      ).sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

      const totalPnL = strategyTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
      const wins = strategyTrades.filter(t => (t.pnl || 0) > 0).length;
      const winRate = strategyTrades.length > 0 ? wins / strategyTrades.length : 0;
      
      const grossProfits = strategyTrades.filter(t => (t.pnl || 0) > 0).reduce((acc, t) => acc + (t.pnl || 0), 0);
      const grossLosses = Math.abs(strategyTrades.filter(t => (t.pnl || 0) < 0).reduce((acc, t) => acc + (t.pnl || 0), 0));
      const profitFactor = grossLosses === 0 ? (grossProfits > 0 ? grossProfits : 0) : grossProfits / grossLosses;

      let cumulative = 0;
      const equityCurve = strategyTrades.map((t, index) => {
        cumulative += (t.pnl || 0);
        return { tradeIndex: index + 1, cumulativePnL: cumulative, time: t.entryTime };
      });
      equityCurve.unshift({ tradeIndex: 0, cumulativePnL: 0, time: backtestStartDate || strategyTrades[0]?.entryTime || '' });

      setBacktestResult({
        strategyName: strategiesMap.get(backtestStrategyId)?.name || 'Unknown',
        totalPnL,
        winRate,
        profitFactor,
        tradeCount: strategyTrades.length,
        equityCurve,
        trades: strategyTrades
      });
      setIsRunningBacktest(false);
    }, 800);
  };

  const handleAiAnalysis = async () => {
    if (!backtestResult) return;

    const cacheKey = `strategy_analysis_${userId}_${backtestStrategyId}_${backtestResult.tradeCount}`;
    const cached = getCache(cacheKey);
    const contextHash = `${backtestResult.tradeCount}_${backtestResult.totalPnL}`;

    if (isCacheValid(cached, 24 * 60 * 60 * 1000, contextHash)) {
      setAiAnalysis(cached?.data);
      return;
    }

    setIsAnalyzing(true);
    try {
      const prompt = `
        As a professional trading performance analyst and risk manager, evaluate this trading strategy based on its backtest results.
        
        Strategy Name: ${backtestResult.strategyName}
        Strategy Rules: ${strategiesMap.get(backtestStrategyId)?.rules || 'No rules defined'}
        
        Performance Metrics:
        - Total PnL: ${formatCurrency(backtestResult.totalPnL)}
        - Win Rate: ${formatPercent(backtestResult.winRate)}
        - Profit Factor: ${backtestResult.profitFactor.toFixed(2)}
        - Total Trades: ${backtestResult.tradeCount}
        - Avg. Trade: ${formatCurrency(backtestResult.totalPnL / backtestResult.tradeCount)}
        
        Please provide a deep audit including:
        1. **Performance Verdict**: A critical assessment of the strategy's viability.
        2. **Risk Analysis**: Identification of potential flaws, "black swan" risks, or psychological traps based on the rules and results.
        3. **Optimization Roadmap**: Specific, actionable technical or behavioral recommendations to improve the Win Rate, Profit Factor, or Risk-Adjusted Return.
        4. **Market Context**: How this strategy might perform in different market regimes (Trending vs. Ranging).
        5. **Strategy Score**: An overall "Nexus Viability Score" out of 100.
        
        Format the response in clean, professional Markdown with clear headings.
      `;

      const result = await generateContent({
        model: AI_MODELS.FLASH,
        contents: prompt
      });
      setAiAnalysis(result.text);
      setCache(cacheKey, result.text, contextHash);
    } catch (error) {
      console.error('AI Analysis error:', error);
      setAiAnalysis('Failed to generate AI analysis. Please check your API key and try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#f43f5e', '#ec4899'];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
            <Target size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold tracking-tight">Strategy Performance</h3>
            <p className="text-sm text-zinc-400">Comparative analysis of your trading strategies</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button 
            onClick={() => setIsBacktesting(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-400 transition-all hover:bg-zinc-800 hover:text-zinc-100 sm:flex-none"
          >
            <Activity size={16} />
            Backtest
          </button>
          <button 
            onClick={handleSeedXAUUSDData}
            disabled={isSeeding}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-400 transition-all hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50 sm:flex-none"
          >
            {isSeeding ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" /> : <Database size={16} />}
            {isSeeding ? 'Seeding...' : 'Seed Data'}
          </button>
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-95 sm:flex-none"
          >
            {isAdding ? <X size={16} /> : <Plus size={16} />}
            {isAdding ? 'Cancel' : 'New Strategy'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 shadow-sm">
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500 uppercase tracking-wider">Search Strategy</label>
          <input 
            type="text"
            placeholder="Filter by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div className="w-40">
          <label className="mb-1 block text-xs font-medium text-zinc-500 uppercase tracking-wider">From Date</label>
          <input 
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div className="w-40">
          <label className="mb-1 block text-xs font-medium text-zinc-500 uppercase tracking-wider">To Date</label>
          <input 
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
        {(searchTerm || startDate || endDate) && (
          <button 
            onClick={() => { setSearchTerm(''); setStartDate(''); setEndDate(''); }}
            className="mt-5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Clear Filters
          </button>
        )}
      </div>

      {isAdding && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-4">
            <input
              autoFocus
              type="text"
              placeholder="Strategy Name (e.g., Breakout, Mean Reversion)"
              className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={newStrategyName}
              onChange={(e) => setNewStrategyName(e.target.value)}
            />
            <button 
              onClick={() => setIsAdding(false)}
              className="p-2.5 text-zinc-400 hover:text-zinc-100"
            >
              <X size={20} />
            </button>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Strategy Rules</label>
            <textarea
              rows={4}
              placeholder="Define your entry/exit rules, risk parameters..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={newStrategyRules}
              onChange={(e) => setNewStrategyRules(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Strategy Notes (Optional)</label>
            <textarea
              rows={2}
              placeholder="Additional notes about this strategy..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={newStrategyNotes}
              onChange={(e) => setNewStrategyNotes(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Manual Trade IDs (Optional, comma-separated)</label>
            <input
              type="text"
              placeholder="e.g., trade_id_1, trade_id_2"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={manualTradeIds}
              onChange={(e) => setManualTradeIds(e.target.value)}
            />
          </div>

          {unassignedTrades.length > 0 && (
            <div className="space-y-3">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Associate Existing Trades (Optional)</label>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/50 divide-y divide-zinc-800">
                {unassignedTrades.map(trade => (
                  <div 
                    key={trade.id}
                    onClick={() => toggleTradeSelection(trade.id)}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold",
                        trade.direction === 'LONG' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                      )}>
                        {trade.direction === 'LONG' ? 'L' : 'S'}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{trade.symbol}</div>
                        <div className="text-xs text-zinc-500">{new Date(trade.entryTime).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "text-sm font-mono",
                        (trade.pnl || 0) >= 0 ? "text-emerald-500" : "text-rose-500"
                      )}>
                        {formatCurrency(trade.pnl || 0)}
                      </div>
                      {selectedTradeIds.has(trade.id) ? (
                        <CheckSquare className="text-emerald-500" size={20} />
                      ) : (
                        <Square className="text-zinc-700" size={20} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button 
              onClick={handleAddStrategy}
              className="flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-2.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
            >
              <Save size={16} />
              Save Strategy
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        {/* PnL Bar Chart */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm">
          <h4 className="mb-6 text-sm font-medium text-zinc-400 uppercase tracking-wider">Total PnL by Strategy</h4>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="name" stroke="#71717a" fontSize={12} axisLine={false} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={12} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="totalPnL" radius={[4, 4, 0, 0]}>
                  {filteredStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.totalPnL >= 0 ? '#10b981' : '#f43f5e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Win Rate Bar Chart */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm">
          <h4 className="mb-6 text-sm font-medium text-zinc-400 uppercase tracking-wider">Win Rate by Strategy</h4>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="name" stroke="#71717a" fontSize={12} axisLine={false} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={12} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                <Tooltip 
                  formatter={(value: number) => formatPercent(value)}
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                  {filteredStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Equity Curves Line Chart */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <Activity size={18} className="text-zinc-400" />
          <h4 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Equity Curves (Cumulative PnL)</h4>
        </div>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis 
                type="number" 
                dataKey="tradeIndex" 
                stroke="#71717a" 
                fontSize={12} 
                axisLine={false} 
                tickLine={false} 
                label={{ value: 'Number of Trades', position: 'insideBottom', offset: -5, fill: '#71717a', fontSize: 12 }}
              />
              <YAxis stroke="#71717a" fontSize={12} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                itemStyle={{ color: '#fff' }}
              />
              <Legend verticalAlign="top" height={36} />
              {filteredStats.map((s, index) => (
                <Line
                  key={s.id}
                  type="monotone"
                  data={s.equityCurve}
                  dataKey="cumulativePnL"
                  name={s.name}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Individual Trade PnL Bar Charts */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {filteredStats.map((s, index) => (
          <div key={`pnl-chart-${s.id}`} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp size={18} className="text-zinc-400" />
                <h4 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">{s.name} - Trade PnL</h4>
              </div>
              <span className={cn(
                "text-xs font-bold px-2 py-1 rounded-full",
                s.totalPnL >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
              )}>
                {formatCurrency(s.totalPnL)}
              </span>
            </div>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={s.tradePnLs}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="tradeIndex" stroke="#71717a" fontSize={12} axisLine={false} tickLine={false} />
                  <YAxis stroke="#71717a" fontSize={12} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip 
                    formatter={(value: number, name: string, props: any) => [formatCurrency(value), `Trade #${props.payload.tradeIndex} (${props.payload.symbol})`]}
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="pnl">
                    {s.tradePnLs.map((entry, i) => (
                      <Cell key={`cell-${i}`} fill={entry.pnl >= 0 ? '#10b981' : '#f43f5e'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>

      {/* Detailed Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/30 text-zinc-400">
                <th className="px-6 py-4 font-medium">Strategy Name</th>
                <th className="px-6 py-4 font-medium">Trades</th>
                <th className="px-6 py-4 font-medium">Win Rate</th>
                <th className="px-6 py-4 font-medium">Profit Factor</th>
                <th className="px-6 py-4 font-medium">Total PnL</th>
                <th className="px-6 py-4 font-medium">Avg. PnL</th>
                <th className="px-6 py-4 font-medium">Performance</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredStats.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-6 py-4 font-semibold">{s.name}</td>
                  <td className="px-6 py-4 text-zinc-300">{s.tradeCount}</td>
                  <td className="px-6 py-4 text-zinc-300">{formatPercent(s.winRate)}</td>
                  <td className={cn(
                    "px-6 py-4 font-medium",
                    s.profitFactor >= 1.5 ? "text-emerald-500" : s.profitFactor >= 1 ? "text-zinc-300" : "text-rose-500"
                  )}>
                    {s.profitFactor.toFixed(2)}
                  </td>
                  <td className={cn(
                    "px-6 py-4 font-bold",
                    s.totalPnL >= 0 ? "text-emerald-500" : "text-rose-500"
                  )}>
                    {formatCurrency(s.totalPnL)}
                  </td>
                  <td className="px-6 py-4 text-zinc-300">{formatCurrency(s.avgPnL)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 rounded-full bg-zinc-800 overflow-hidden">
                        <div 
                          className={cn("h-full rounded-full", s.winRate >= 0.5 ? "bg-emerald-500" : "bg-rose-500")}
                          style={{ width: `${s.winRate * 100}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {s.id !== 'unassigned' && (
                      <button 
                        onClick={() => setViewingStrategy(s)}
                        className="p-2 text-zinc-400 hover:text-emerald-500 transition-colors"
                        title="View Strategy Rules"
                      >
                        <BookOpen size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {stats.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                    No strategy data available. Assign strategies to your trades to see analysis.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Backtest Modal */}
      {isBacktesting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="my-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-zinc-800 p-4">
              <div className="flex items-center gap-2 text-blue-500">
                <Activity size={20} />
                <h3 className="font-bold">Strategy Backtester</h3>
              </div>
              <button 
                onClick={() => { setIsBacktesting(false); setBacktestResult(null); }}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="max-h-[80vh] overflow-y-auto p-6">
              {!backtestResult ? (
                <div className="space-y-6">
                  <p className="text-sm text-zinc-400">
                    Run a historical simulation of your strategy against your logged trade data. 
                    This will analyze all closed trades assigned to the selected strategy within the specified date range.
                  </p>
                  
                  <div className="grid gap-6 md:grid-cols-3">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Select Strategy</label>
                      <select 
                        value={backtestStrategyId}
                        onChange={(e) => setBacktestStrategyId(e.target.value)}
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                      >
                        <option value="">Choose a strategy...</option>
                        {Array.from(strategiesMap.entries()).map(([id, s]) => (
                          <option key={id} value={id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Start Date</label>
                      <input 
                        type="date"
                        value={backtestStartDate}
                        onChange={(e) => setBacktestStartDate(e.target.value)}
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">End Date</label>
                      <input 
                        type="date"
                        value={backtestEndDate}
                        onChange={(e) => setBacktestEndDate(e.target.value)}
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-center pt-4">
                    <button 
                      onClick={handleRunBacktest}
                      disabled={!backtestStrategyId || isRunningBacktest}
                      className="flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3 font-bold text-white transition-all hover:bg-blue-500 disabled:opacity-50"
                    >
                      {isRunningBacktest ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Simulating...
                        </>
                      ) : (
                        <>
                          <Activity size={18} />
                          Run Backtest
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-bold text-zinc-100">{backtestResult.strategyName}</h4>
                      <p className="text-sm text-zinc-500">
                        {backtestStartDate || 'Beginning'} to {backtestEndDate || 'Today'} • {backtestResult.tradeCount} Trades
                      </p>
                    </div>
                    <button 
                      onClick={() => setBacktestResult(null)}
                      className="text-sm font-medium text-blue-500 hover:text-blue-400"
                    >
                      New Backtest
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Total PnL</p>
                      <p className={cn("text-xl font-bold", backtestResult.totalPnL >= 0 ? "text-emerald-500" : "text-rose-500")}>
                        {formatCurrency(backtestResult.totalPnL)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Win Rate</p>
                      <p className="text-xl font-bold text-zinc-100">{formatPercent(backtestResult.winRate)}</p>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Profit Factor</p>
                      <p className={cn("text-xl font-bold", backtestResult.profitFactor >= 1.5 ? "text-emerald-500" : backtestResult.profitFactor >= 1 ? "text-zinc-100" : "text-rose-500")}>
                        {backtestResult.profitFactor.toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Avg. Trade</p>
                      <p className="text-xl font-bold text-zinc-100">
                        {formatCurrency(backtestResult.tradeCount > 0 ? backtestResult.totalPnL / backtestResult.tradeCount : 0)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Backtest Equity Curve</h5>
                      <button 
                        onClick={handleAiAnalysis}
                        disabled={isAnalyzing}
                        className={cn(
                          "relative flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest transition-all active:scale-95 overflow-hidden",
                          isAnalyzing 
                            ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" 
                            : "bg-white text-zinc-950 hover:bg-emerald-400 group"
                        )}
                      >
                        {isAnalyzing ? (
                          <div className="flex items-center gap-1">
                            <motion.span animate={{ scale: [1, 1.4, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="h-1 w-1 rounded-full bg-indigo-500" />
                            <motion.span animate={{ scale: [1, 1.4, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="h-1 w-1 rounded-full bg-emerald-500" />
                            <motion.span animate={{ scale: [1, 1.4, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="h-1 w-1 rounded-full bg-cyan-500" />
                            <span className="ml-2 uppercase tracking-tighter">Analyzing Trace...</span>
                          </div>
                        ) : (
                          <>
                            <Sparkles size={14} className="text-zinc-950 group-hover:animate-pulse" />
                            Generate Auditor Report
                          </>
                        )}
                      </button>
                    </div>
                    
                    {aiAnalysis && (
                      <div className="rounded-2xl border border-white/5 bg-zinc-900/40 p-8 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-500">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent opacity-50" />
                        
                        <div className="relative z-10">
                          <div className="mb-6 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="relative flex h-10 w-10 items-center justify-center">
                                <div className="absolute inset-0 animate-spin-slow rounded-xl bg-gradient-to-tr from-indigo-500 via-emerald-400 to-cyan-400 blur-[2px] opacity-40" />
                                <div className="relative flex h-full w-full items-center justify-center rounded-xl bg-zinc-950 text-white">
                                  <Sparkles size={20} className="text-emerald-400" />
                                </div>
                              </div>
                              <div>
                                <h6 className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500/80">Nexus Intelligence Audit</h6>
                                <h5 className="text-sm font-bold text-white">Performance Roadmap Summary</h5>
                              </div>
                            </div>
                            <button
                              onClick={() => setAiAnalysis(null)}
                              className="rounded-full bg-white/5 p-2 text-zinc-500 transition-all hover:bg-white/10 hover:text-white"
                            >
                              <X size={16} />
                            </button>
                          </div>

                          <div className="prose prose-invert prose-sm max-w-none prose-emerald bg-black/20 p-6 rounded-2xl border border-white/5 shadow-inner">
                            <Markdown>{aiAnalysis}</Markdown>
                          </div>
                          
                          <div className="mt-8 flex items-center justify-between border-t border-white/5 pt-6">
                            <button
                              onClick={() => {
                                window.dispatchEvent(new CustomEvent('nexus-chat-context', {
                                  detail: {
                                    message: "Let's discuss my strategy backtest results and your suggestions further.",
                                    context: `
                                      Strategy: ${backtestResult.strategyName}
                                      Stats: PnL ${backtestResult.totalPnL}, Win Rate ${backtestResult.winRate}, Profit Factor ${backtestResult.profitFactor}
                                      Total Trades: ${backtestResult.tradeCount}
                                      AI Initial Analysis: ${aiAnalysis}
                                    `.trim()
                                  }
                                }));
                              }}
                              className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-950 hover:bg-emerald-400 transition-all active:scale-95 group shadow-lg shadow-emerald-500/10"
                            >
                              <Sparkles size={12} className="group-hover:scale-125 transition-transform" />
                              Deep Dive with Nexus
                            </button>
                            
                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                              Verified Audit Trace • Nexus v1.0
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="h-[300px] w-full rounded-xl border border-zinc-800 bg-zinc-950/30 p-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={backtestResult.equityCurve}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                          <XAxis 
                            dataKey="tradeIndex" 
                            stroke="#71717a" 
                            fontSize={10} 
                            axisLine={false} 
                            tickLine={false} 
                          />
                          <YAxis stroke="#71717a" fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                            itemStyle={{ color: '#fff' }}
                            labelFormatter={(v) => `Trade #${v}`}
                          />
                          <Line
                            type="monotone"
                            dataKey="cumulativePnL"
                            stroke="#3b82f6"
                            strokeWidth={3}
                            dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
                            activeDot={{ r: 6, strokeWidth: 0 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-end border-t border-zinc-800 bg-zinc-900/50 p-4">
              <button 
                onClick={() => { setIsBacktesting(false); setBacktestResult(null); }}
                className="rounded-lg bg-zinc-800 px-6 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Strategy Rules Modal */}
      {viewingStrategy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-zinc-800 p-4">
              <div className="flex items-center gap-2 text-emerald-500">
                <BookOpen size={20} />
                <h3 className="font-bold">{viewingStrategy.name} - Rules</h3>
              </div>
              <button 
                onClick={() => setViewingStrategy(null)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X size={20} />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-6">
              {viewingStrategy.rules ? (
                <div className="markdown-body prose prose-invert max-w-none">
                  <Markdown>{viewingStrategy.rules}</Markdown>
                </div>
              ) : (
                <p className="text-center text-zinc-500 italic">No rules defined for this strategy.</p>
              )}
            </div>
            <div className="flex items-center justify-end bg-zinc-900/50 p-4">
              <button 
                onClick={() => setViewingStrategy(null)}
                className="rounded-lg bg-zinc-800 px-6 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
