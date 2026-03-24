import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, onSnapshot, limit, addDoc, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Trade, UserStats, Strategy, UserSettings } from '../types';
import { formatCurrency, formatPercent, cn } from '../lib/utils';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from 'recharts';
import { TrendingUp, Activity, DollarSign, Target, Calendar, Filter, Zap, Globe, ShieldAlert, Clock } from 'lucide-react';
import { subDays, isAfter, startOfDay, endOfDay, startOfWeek, endOfWeek, format, isBefore, subMinutes, addMinutes } from 'date-fns';
import { GoogleGenAI, Type } from "@google/genai";
import { generateContent, getCache, setCache, isCacheValid, AI_MODELS } from '../services/aiService';

export default function Dashboard({ userId }: { userId: string }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<Map<string, string>>(new Map());
  const [timeFilter, setTimeFilter] = useState<'30d' | '90d' | 'all'>('30d');
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [aiBriefing, setAiBriefing] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);

  useEffect(() => {
    const strategiesQuery = query(collection(db, 'strategies'), where('userId', '==', userId));
    const unsubscribeStrategies = onSnapshot(strategiesQuery, (snapshot) => {
      const sMap = new Map<string, string>();
      snapshot.docs.forEach(doc => sMap.set(doc.id, (doc.data() as Strategy).name));
      setStrategies(sMap);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'strategies');
    });

    const settingsQuery = query(collection(db, 'settings'), where('userId', '==', userId));
    const unsubscribeSettings = onSnapshot(settingsQuery, (snapshot) => {
      if (!snapshot.empty) {
        setSettings(snapshot.docs[0].data() as UserSettings);
      } else {
        // Default settings
        setSettings({
          userId,
          currency: 'USD',
          dailyGoal: 500,
          weeklyGoal: 2500,
          notifications: {
            tp_hit: true,
            sl_hit: true,
            goal_reached: true,
            daily_summary: false
          }
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'settings');
    });

    const tradesQuery = query(
      collection(db, 'trades'),
      where('userId', '==', userId),
      orderBy('entryTime', 'desc')
    );

    const unsubscribeTrades = onSnapshot(tradesQuery, async (snapshot) => {
      const tradesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trade));
      
      if (tradesData.length === 0) {
        // Auto-seeding: 30 days of realistic trades
        const seedTrades = async () => {
          const pairs = ['BTC/USD', 'ETH/USD', 'EUR/USD', 'GBP/USD', 'AAPL', 'TSLA'];
          const now = new Date();
          for (let i = 0; i < 30; i++) {
            const date = subDays(now, i);
            const numTrades = Math.floor(Math.random() * 3) + 1;
            for (let j = 0; j < numTrades; j++) {
              const pair = pairs[Math.floor(Math.random() * pairs.length)];
              const direction = Math.random() > 0.5 ? 'LONG' : 'SHORT';
              const entry = Math.random() * 50000 + 100;
              const win = Math.random() > 0.4;
              const pnl = win ? Math.random() * 1000 + 100 : -(Math.random() * 500 + 50);
              const exit = direction === 'LONG' ? entry + (pnl / 10) : entry - (pnl / 10);
              
              await addDoc(collection(db, 'trades'), {
                userId,
                symbol: pair,
                entryPrice: entry,
                exitPrice: exit,
                quantity: 1,
                direction,
                status: 'CLOSED',
                pnl,
                entryTime: date.toISOString(),
                exitTime: date.toISOString(),
                notes: win ? 'Followed plan, good execution.' : 'Slightly early entry, but stuck to SL.',
              });
            }
          }
        };
        seedTrades();
      }
      
      setTrades(tradesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trades');
    });

    return () => {
      unsubscribeStrategies();
      unsubscribeSettings();
      unsubscribeTrades();
    };
  }, [userId]);

  const filteredTrades = useMemo(() => {
    const now = new Date();
    let cutoff: Date | null = null;
    if (timeFilter === '30d') cutoff = subDays(now, 30);
    if (timeFilter === '90d') cutoff = subDays(now, 90);

    return trades.filter(t => {
      if (!cutoff) return true;
      return isAfter(new Date(t.entryTime), cutoff);
    });
  }, [trades, timeFilter]);

  const stats = useMemo(() => {
    const closedTrades = filteredTrades.filter(t => t.status === 'CLOSED');
    const totalProfit = closedTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const wins = closedTrades.filter(t => (t.pnl || 0) > 0);
    const losses = closedTrades.filter(t => (t.pnl || 0) < 0);
    
    const winRate = closedTrades.length > 0 ? wins.length / closedTrades.length : 0;
    
    const totalWinAmount = wins.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const totalLossAmount = Math.abs(losses.reduce((acc, t) => acc + (t.pnl || 0), 0));
    const profitFactor = totalLossAmount === 0 ? (totalWinAmount > 0 ? 10 : 0) : totalWinAmount / totalLossAmount;

    const avgWin = wins.length > 0 ? totalWinAmount / wins.length : 0;
    const avgLoss = losses.length > 0 ? totalLossAmount / losses.length : 0;
    const expectancy = (avgWin * winRate) - (avgLoss * (1 - winRate));

    // Max Drawdown
    let maxEquity = 0;
    let maxDD = 0;
    let currentEquity = 0;
    
    const sortedForDD = [...closedTrades]
      .filter(t => t.entryTime && t.pnl !== undefined)
      .sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

    sortedForDD.forEach(t => {
      currentEquity += (t.pnl || 0);
      if (currentEquity > maxEquity) maxEquity = currentEquity;
      const dd = maxEquity - currentEquity;
      if (dd > maxDD) maxDD = dd;
    });

    // Daily/Weekly Goal Progress
    const today = startOfDay(new Date());
    const weekStart = startOfWeek(new Date());
    
    const dailyPnL = closedTrades
      .filter(t => t.exitTime && isAfter(new Date(t.exitTime), today))
      .reduce((acc, t) => acc + (t.pnl || 0), 0);
      
    const weeklyPnL = closedTrades
      .filter(t => t.exitTime && isAfter(new Date(t.exitTime), weekStart))
      .reduce((acc, t) => acc + (t.pnl || 0), 0);

    // Equity Curve Data (Cumulative)
    let cumulative = 0;
    const sortedClosedTrades = [...closedTrades]
      .filter(t => t.entryTime && t.pnl !== undefined)
      .sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

    const equityCurve = sortedClosedTrades.map(t => {
      cumulative += (t.pnl || 0);
      return { 
        time: format(new Date(t.entryTime), 'MMM d'), 
        value: cumulative,
        pnl: t.pnl,
        pair: t.symbol
      };
    });

    // Add a starting point if we have data
    if (equityCurve.length > 0) {
      const firstDate = new Date(sortedClosedTrades[0].entryTime);
      const startDate = subDays(firstDate, 1);
      equityCurve.unshift({
        time: format(startDate, 'MMM d'),
        value: 0,
        pnl: 0,
        pair: 'Start'
      });
    }

    return {
      totalProfit,
      winRate,
      totalTrades: closedTrades.length,
      profitFactor,
      dailyPnL,
      weeklyPnL,
      equityCurve,
      avgWin,
      avgLoss,
      expectancy,
      maxDD
    };
  }, [filteredTrades]);

  const cards = [
    { label: 'Total Profit', value: formatCurrency(stats.totalProfit), icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10', sub: `${stats.totalTrades} trades` },
    { label: 'Win Rate', value: formatPercent(stats.winRate), icon: Activity, color: 'text-blue-500', bg: 'bg-blue-500/10', sub: `${(stats.winRate * 100).toFixed(1)}% accuracy` },
    { label: 'Profit Factor', value: stats.profitFactor.toFixed(2), icon: Zap, color: 'text-orange-500', bg: 'bg-orange-500/10', sub: 'Gross P/L ratio' },
    { label: 'Expectancy', value: formatCurrency(stats.expectancy), icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-500/10', sub: 'Per trade value' },
  ];

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (stats.totalTrades === 0) return;

      const cacheKey = `dashboard_data_${userId}`;
      const cached = getCache(cacheKey);
      const contextHash = `${stats.totalTrades}_${timeFilter}`;

      if (isCacheValid(cached, 6 * 60 * 60 * 1000, contextHash)) {
        setUpcomingEvents(cached?.data.events || []);
        setAiBriefing(cached?.data.briefing || null);
        return;
      }

      setLoadingEvents(true);
      setIsBriefingLoading(true);

      try {
        const prompt = `
          Task 1: Fetch the top 3 high-impact economic events for the next 48 hours. 
          Focus on USD, EUR, GBP. 
          
          Task 2: As an expert trading coach, provide a concise (2-3 sentence) daily briefing based on these performance stats:
          - Total Profit: ${formatCurrency(stats.totalProfit)}
          - Win Rate: ${formatPercent(stats.winRate)}
          - Profit Factor: ${stats.profitFactor.toFixed(2)}
          - Expectancy: ${formatCurrency(stats.expectancy)}
          - Max Drawdown: ${formatCurrency(stats.maxDD)}
          
          Return as a JSON object:
          {
            "events": [{ "time": "ISO string", "currency": "string", "event": "string", "impact": "High" }],
            "briefing": "string"
          }
        `;

        const response = await generateContent({
          model: AI_MODELS.FLASH,
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                events: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      time: { type: Type.STRING },
                      currency: { type: Type.STRING },
                      event: { type: Type.STRING },
                      impact: { type: Type.STRING }
                    },
                    required: ['time', 'currency', 'event', 'impact']
                  }
                },
                briefing: { type: Type.STRING }
              },
              required: ['events', 'briefing']
            }
          }
        });

        const data = JSON.parse(response.text);
        setUpcomingEvents(data.events);
        setAiBriefing(data.briefing);
        setCache(cacheKey, data, contextHash);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoadingEvents(false);
        setIsBriefingLoading(false);
      }
    };

    fetchDashboardData();
  }, [userId, stats.totalTrades, timeFilter]);

  return (
    <div className="space-y-8">
      {/* Header with Time Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
            <Activity size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Trading Overview</h2>
            <p className="text-sm text-zinc-400">Track your performance and goals</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-1">
          {(['30d', '90d', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setTimeFilter(f)}
              className={cn(
                "rounded-lg px-4 py-1.5 text-xs font-bold uppercase transition-all",
                timeFilter === f ? "bg-emerald-500 text-zinc-950" : "text-zinc-400 hover:text-zinc-100"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* AI Briefing */}
      {(aiBriefing || isBriefingLoading) && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 shadow-sm backdrop-blur-sm animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-500">
              <Zap size={18} />
            </div>
            <h3 className="font-bold text-emerald-500">Daily AI Briefing</h3>
          </div>
          {isBriefingLoading ? (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              <span className="text-sm text-zinc-400">Analyzing your performance...</span>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-zinc-300 italic">"{aiBriefing}"</p>
          )}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm transition-all hover:border-zinc-700 hover:bg-zinc-900">
            <div className="mb-4 flex items-center justify-between">
              <div className={cn("rounded-lg p-2 transition-transform group-hover:scale-110", card.bg, card.color)}>
                <card.icon size={20} />
              </div>
            </div>
            <p className="text-sm font-medium text-zinc-400">{card.label}</p>
            <p className="text-2xl font-bold">{card.value}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Avg Win</p>
            <p className="text-lg font-bold text-emerald-500">{formatCurrency(stats.avgWin)}</p>
          </div>
          <div className="h-8 w-px bg-zinc-800" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Avg Loss</p>
            <p className="text-lg font-bold text-rose-500">{formatCurrency(stats.avgLoss)}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Max Drawdown</p>
          <p className="text-lg font-bold text-rose-500">{formatCurrency(stats.maxDD)}</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Reward/Risk Ratio</p>
          <p className="text-lg font-bold text-zinc-100">{(stats.avgWin / (stats.avgLoss || 1)).toFixed(2)}</p>
        </div>
      </div>

      {/* Goal Tracking */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="text-emerald-500" size={20} />
              <h3 className="font-bold">Daily Goal</h3>
            </div>
            <span className="text-sm font-medium text-zinc-400">
              {formatCurrency(stats.dailyPnL)} / {formatCurrency(settings?.dailyGoal || 0)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-zinc-800">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-1000",
                stats.dailyPnL >= (settings?.dailyGoal || 0) ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-emerald-500/50"
              )}
              style={{ width: `${Math.min(100, Math.max(0, (stats.dailyPnL / (settings?.dailyGoal || 1)) * 100))}%` }}
            />
          </div>
          {stats.dailyPnL >= (settings?.dailyGoal || 0) && (
            <p className="mt-2 text-xs font-bold text-emerald-500 animate-pulse">Daily goal achieved! 🚀</p>
          )}
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="text-blue-500" size={20} />
              <h3 className="font-bold">Weekly Goal</h3>
            </div>
            <span className="text-sm font-medium text-zinc-400">
              {formatCurrency(stats.weeklyPnL)} / {formatCurrency(settings?.weeklyGoal || 0)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-zinc-800">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-1000",
                stats.weeklyPnL >= (settings?.weeklyGoal || 0) ? "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" : "bg-blue-500/50"
              )}
              style={{ width: `${Math.min(100, Math.max(0, (stats.weeklyPnL / (settings?.weeklyGoal || 1)) * 100))}%` }}
            />
          </div>
          {stats.weeklyPnL >= (settings?.weeklyGoal || 0) && (
            <p className="mt-2 text-xs font-bold text-blue-500 animate-pulse">Weekly goal achieved! 🎯</p>
          )}
        </div>

        {/* Economic Calendar Widget */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="text-orange-500" size={20} />
              <h3 className="font-bold">Market Alerts</h3>
            </div>
            <span className="text-[10px] font-bold uppercase text-zinc-500">Next 48h</span>
          </div>
          <div className="space-y-3">
            {loadingEvents ? (
              <div className="flex items-center gap-2 py-2">
                <div className="h-3 w-3 animate-spin rounded-full border border-zinc-500 border-t-transparent" />
                <span className="text-xs text-zinc-500">Checking news...</span>
              </div>
            ) : upcomingEvents.length > 0 ? (
              upcomingEvents.map((event, i) => {
                const eventDate = new Date(event.time);
                const isNoTrade = isAfter(new Date(), subMinutes(eventDate, 30)) && isBefore(new Date(), addMinutes(eventDate, 30));
                return (
                  <div key={i} className={cn(
                    "flex items-center justify-between rounded-lg p-2 transition-colors",
                    isNoTrade ? "bg-rose-500/10 border border-rose-500/20" : "bg-zinc-950/50"
                  )}>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-[10px] font-bold text-zinc-500">{event.currency} • {format(eventDate, 'HH:mm')}</span>
                      <span className="text-xs font-medium text-zinc-200 truncate">{event.event}</span>
                    </div>
                    {isNoTrade ? (
                      <div className="flex items-center gap-1 text-rose-500 animate-pulse">
                        <ShieldAlert size={12} />
                        <span className="text-[10px] font-bold uppercase">Alert</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-zinc-500">
                        <Clock size={12} />
                        <span className="text-[10px] font-bold uppercase">Soon</span>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="py-2 text-xs text-zinc-500 italic">No major events found.</p>
            )}
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Equity Curve */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm">
          <h3 className="mb-6 text-lg font-semibold">Equity Curve (Cumulative)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.equityCurve}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="time" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={10} tickFormatter={(v) => `$${v}`} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                  formatter={(value: number) => [formatCurrency(value), 'Equity']}
                />
                <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Trade PnL History Bar Chart */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm">
          <h3 className="mb-6 text-lg font-semibold">Trade PnL History</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.equityCurve.slice(-20)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="time" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={10} tickFormatter={(v) => `$${v}`} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                  formatter={(value: number, name: string, props: any) => [formatCurrency(value), `${props.payload.pair} PnL`]}
                />
                <Bar dataKey="pnl">
                  {stats.equityCurve.slice(-20).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={(entry.pnl || 0) >= 0 ? '#10b981' : '#f43f5e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
