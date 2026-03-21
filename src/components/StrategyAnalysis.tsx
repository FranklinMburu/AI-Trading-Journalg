import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Trade, Strategy } from '../types';
import { formatCurrency, formatPercent, cn } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, LineChart, Line, Legend } from 'recharts';
import { Target, TrendingUp, AlertCircle, Plus, Save, X, Activity, CheckSquare, Square, BookOpen, Database } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { GoogleGenAI, Type } from "@google/genai";

interface StrategyStats {
  id: string;
  name: string;
  rules: string;
  totalPnL: number;
  winRate: number;
  tradeCount: number;
  avgPnL: number;
  equityCurve: { tradeIndex: number; cumulativePnL: number }[];
  tradePnLs: { tradeIndex: number; pnl: number; symbol: string }[];
  createdAt: string;
}

export default function StrategyAnalysis({ userId }: { userId: string }) {
  const [stats, setStats] = useState<StrategyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newStrategyName, setNewStrategyName] = useState('');
  const [newStrategyRules, setNewStrategyRules] = useState('');
  const [newStrategyNotes, setNewStrategyNotes] = useState('');
  const [manualTradeIds, setManualTradeIds] = useState('');
  const [unassignedTrades, setUnassignedTrades] = useState<Trade[]>([]);
  const [selectedTradeIds, setSelectedTradeIds] = useState<Set<string>>(new Set());
  const [viewingStrategy, setViewingStrategy] = useState<StrategyStats | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  
  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleAddStrategy = async () => {
    if (!newStrategyName.trim()) return;
    try {
      const strategyRef = await addDoc(collection(db, 'strategies'), {
        userId,
        name: newStrategyName,
        rules: newStrategyRules,
        notes: newStrategyNotes,
        createdAt: new Date().toISOString()
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
          updateDoc(doc(db, 'trades', tradeId), { strategyId: strategyRef.id })
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
      console.error('Error adding strategy:', error);
    }
  };

  const handleSeedXAUUSDData = async () => {
    setIsSeeding(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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

      const trades = JSON.parse(response.text);

      // Create a strategy for these trades
      const strategyRef = await addDoc(collection(db, 'strategies'), {
        userId,
        name: 'XAU/USD Trend Following',
        rules: '1. Identify trend on Daily chart.\n2. Enter on 4H pullback to 20 EMA.\n3. Stop loss below recent swing low.\n4. Take profit at 2:1 Reward:Risk.',
        notes: 'Seeded historical data for XAU/USD performance analysis.',
        createdAt: new Date().toISOString()
      });

      // Add trades to Firestore
      const tradePromises = trades.map((trade: any) => 
        addDoc(collection(db, 'trades'), {
          ...trade,
          userId,
          strategyId: strategyRef.id
        })
      );

      await Promise.all(tradePromises);
      alert('Successfully seeded XAU/USD trades for the last month!');
    } catch (error) {
      console.error('Error seeding data:', error);
      alert('Failed to seed data. Check console for details.');
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
    const q = query(collection(db, 'strategies'), where('userId', '==', userId));
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
    });
  }, [userId]);

  useEffect(() => {
    const q = query(collection(db, 'trades'), where('userId', '==', userId));
    return onSnapshot(q, (snapshot) => {
      setRawTrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trade)));
    });
  }, [userId]);

  useEffect(() => {
    if (rawTrades.length === 0 && strategiesMap.size === 0) {
      // Still loading or no data
      if (!loading) setLoading(false); // Ensure we don't stay in loading forever if no data
      return;
    }

    const unassigned = rawTrades.filter(t => !t.strategyId || t.strategyId === 'unassigned');
    setUnassignedTrades(unassigned);

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
      
      let cumulative = 0;
      const equityCurve = trades.map((t, index) => {
        cumulative += (t.pnl || 0);
        return { tradeIndex: index + 1, cumulativePnL: cumulative };
      });

      const tradePnLs = trades.map((t, index) => ({
        tradeIndex: index + 1,
        pnl: t.pnl || 0,
        symbol: t.symbol
      }));

      equityCurve.unshift({ tradeIndex: 0, cumulativePnL: 0 });
      
      const strategyInfo = strategiesMap.get(sId);
      calculatedStats.push({
        id: sId,
        name: sId === 'unassigned' ? 'No Strategy' : (strategyInfo?.name || 'Unknown Strategy'),
        rules: strategyInfo?.rules || '',
        totalPnL,
        winRate,
        tradeCount: trades.length,
        avgPnL: trades.length > 0 ? totalPnL / trades.length : 0,
        equityCurve,
        tradePnLs,
        createdAt: sId === 'unassigned' ? new Date(0).toISOString() : (strategyInfo?.createdAt || new Date(0).toISOString())
      });
    });

    setStats(calculatedStats.sort((a, b) => b.totalPnL - a.totalPnL));
    setLoading(false);
  }, [rawTrades, strategiesMap, userId]);

  const filteredStats = stats.filter(s => {
    const matchesName = s.name.toLowerCase().includes(searchTerm.toLowerCase());
    const strategyDate = new Date(s.createdAt);
    const matchesStartDate = !startDate || strategyDate >= new Date(startDate);
    const matchesEndDate = !endDate || strategyDate <= new Date(endDate + 'T23:59:59');
    return matchesName && matchesStartDate && matchesEndDate;
  });

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
            <Target size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold">Strategy Performance</h3>
            <p className="text-sm text-zinc-400">Comparative analysis of your trading strategies</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleSeedXAUUSDData}
            disabled={isSeeding}
            className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50"
          >
            {isSeeding ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" /> : <Database size={16} />}
            {isSeeding ? 'Fetching Market Data...' : 'Seed XAU/USD Data'}
          </button>
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
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
      {/* Strategy Rules Modal */}
      {viewingStrategy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl animate-in fade-in zoom-in duration-200">
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
                  <ReactMarkdown>{viewingStrategy.rules}</ReactMarkdown>
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
