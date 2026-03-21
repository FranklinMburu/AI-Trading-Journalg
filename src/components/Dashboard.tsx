import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, onSnapshot, limit, addDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Trade, UserStats, Strategy, UserSettings } from '../types';
import { formatCurrency, formatPercent, cn } from '../lib/utils';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from 'recharts';
import { TrendingUp, Activity, DollarSign, Target, Calendar, Filter, Zap } from 'lucide-react';
import { subDays, isAfter, startOfDay, endOfDay, startOfWeek, endOfWeek, format } from 'date-fns';

export default function Dashboard({ userId }: { userId: string }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<Map<string, string>>(new Map());
  const [timeFilter, setTimeFilter] = useState<'30d' | '90d' | 'all'>('30d');
  const [settings, setSettings] = useState<UserSettings | null>(null);

  useEffect(() => {
    const strategiesQuery = query(collection(db, 'strategies'), where('userId', '==', userId));
    const unsubscribeStrategies = onSnapshot(strategiesQuery, (snapshot) => {
      const sMap = new Map<string, string>();
      snapshot.docs.forEach(doc => sMap.set(doc.id, (doc.data() as Strategy).name));
      setStrategies(sMap);
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
    const profitFactor = totalLossAmount === 0 ? totalWinAmount : totalWinAmount / totalLossAmount;

    // Daily/Weekly Goal Progress
    const today = startOfDay(new Date());
    const weekStart = startOfWeek(new Date());
    
    const dailyPnL = closedTrades
      .filter(t => isAfter(new Date(t.exitTime || ''), today))
      .reduce((acc, t) => acc + (t.pnl || 0), 0);
      
    const weeklyPnL = closedTrades
      .filter(t => isAfter(new Date(t.exitTime || ''), weekStart))
      .reduce((acc, t) => acc + (t.pnl || 0), 0);

    // Equity Curve Data (Cumulative)
    let cumulative = 0;
    const equityCurve = [...closedTrades]
      .sort((a, b) => new Date(a.exitTime || '').getTime() - new Date(b.exitTime || '').getTime())
      .map(t => {
        cumulative += (t.pnl || 0);
        return { 
          time: format(new Date(t.exitTime || ''), 'MMM d'), 
          value: cumulative,
          pnl: t.pnl,
          pair: t.symbol
        };
      });

    return {
      totalProfit,
      winRate,
      totalTrades: closedTrades.length,
      profitFactor,
      dailyPnL,
      weeklyPnL,
      equityCurve
    };
  }, [filteredTrades]);

  const cards = [
    { label: 'Total Profit', value: formatCurrency(stats.totalProfit), icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Win Rate', value: formatPercent(stats.winRate), icon: Activity, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Profit Factor', value: stats.profitFactor.toFixed(2), icon: Zap, color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { label: 'Total Trades', value: stats.totalTrades, icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  ];

  return (
    <div className="space-y-8">
      {/* Header with Time Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Trading Overview</h2>
          <p className="text-sm text-zinc-400">Track your performance and goals</p>
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

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className={cn("rounded-lg p-2", card.bg, card.color)}>
                <card.icon size={20} />
              </div>
            </div>
            <p className="text-sm font-medium text-zinc-400">{card.label}</p>
            <p className="text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Goal Tracking */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
