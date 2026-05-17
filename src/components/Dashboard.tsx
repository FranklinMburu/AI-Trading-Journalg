import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, onSnapshot, limit, addDoc, getDocs, setDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Trade, UserStats, Strategy, UserSettings } from '../types';
import { formatCurrency, formatPercent, cn } from '../lib/utils';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from 'recharts';
import { TrendingUp, Activity, DollarSign, Target, Calendar, Filter, Zap, Globe, ShieldAlert, Clock, RefreshCw, PlusCircle, Database, ChevronRight } from 'lucide-react';
import { subDays, isAfter, startOfDay, endOfDay, startOfWeek, endOfWeek, format, isBefore, subMinutes, addMinutes } from 'date-fns';
import { GoogleGenAI, Type } from "@google/genai";
import { generateContent, getCache, setCache, isCacheValid, AI_MODELS } from '../services/aiService';

import { useAccount } from '../contexts/AccountContext';
import Dropdown from './Dropdown';

export default function Dashboard({ isDemoMode, onOpenTradeForm }: { isDemoMode: boolean; onOpenTradeForm?: () => void }) {
  const { activeAccount, selectedAccountId, user, accounts, accountsWithTrades, setSelectedAccountId } = useAccount();
    const userId = user?.uid;
    const accountId = selectedAccountId;
  
    useEffect(() => {
     console.log(`[Dashboard Init] UID: ${userId}, Selected: ${accountId}, Mode: ${isDemoMode ? 'DEMO' : 'REAL'}`);
     console.log(`[Dashboard Accounts List]`, accounts.map(a => ({ id: a.id, accNum: a.accountNumber })));
     console.log(`[Dashboard Active Trades]`, accountsWithTrades);
    }, [userId, accountId, isDemoMode, accounts, accountsWithTrades]);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [totalAccountTrades, setTotalAccountTrades] = useState<number | null>(null);
  const [strategies, setStrategies] = useState<Map<string, string>>(new Map());
  const [timeFilter, setTimeFilter] = useState<'30d' | '90d' | 'all'>('30d');
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [aiBriefing, setAiBriefing] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);

  useEffect(() => {
    if (!userId || !accountId) return;

    const strategiesQuery = query(
      collection(db, 'users', userId, 'accounts', accountId, 'strategies'), 
      where('isDemo', '==', isDemoMode)
    );
    return onSnapshot(strategiesQuery, (snapshot) => {
      const sMap = new Map<string, string>();
      snapshot.docs.forEach(doc => sMap.set(doc.id, (doc.data() as Strategy).name));
      setStrategies(sMap);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'strategies');
    });
  }, [userId, accountId, isDemoMode]);

  useEffect(() => {
    if (!userId || !accountId) return;

    const settingsQuery = query(collection(db, 'users', userId, 'accounts', accountId, 'settings'));
    return onSnapshot(settingsQuery, (snapshot) => {
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
  }, [userId, accountId]); // Removed settings from dependencies to avoid loop

  useEffect(() => {
    if (!userId || !accountId) return;

    // Diagnostic query to see if any trades exist at all for this account
    const allTradesQuery = query(collection(db, 'users', userId, 'accounts', accountId, 'trades'), limit(1));
    const unsubscribeAll = onSnapshot(allTradesQuery, (snapshot) => {
      console.log(`[Dashboard Diagnostic] Query Path: users/${userId}/accounts/${accountId}/trades`);
      console.log(`[Dashboard Diagnostic] Total Trades Found ignoring Demo/Real filter: ${snapshot.empty ? 0 : '1+'}`);
      setTotalAccountTrades(snapshot.empty ? 0 : 1);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${userId}/accounts/${accountId}/trades`);
    });

    console.log(`[Dashboard Query Trace] User: ${userId}, Account: ${accountId}, isDemo: ${isDemoMode}`);
    console.log(`[Dashboard Path Trace] collection(db, 'users', '${userId}', 'accounts', '${accountId}', 'trades')`);

    const tradesQuery = query(
      collection(db, 'users', userId, 'accounts', accountId, 'trades'),
      orderBy('entryTime', 'desc'),
      limit(50)
    );

    const unsubscribeTrades = onSnapshot(tradesQuery, async (snapshot) => {
      const tradesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trade));
      console.log(`[Frontend Trace] Account: ${accountId}, isDemo: ${isDemoMode}, Received ${tradesData.length} trades`);
      if (tradesData.length > 0) {
        console.log(`[Frontend Trace] First trade sample:`, tradesData[0]);
      }
      setTrades(tradesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trades');
    });

    return () => {
      unsubscribeAll();
      unsubscribeTrades();
    };
  }, [userId, accountId, isDemoMode]);

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
    const profitFactor = totalLossAmount === 0 ? (totalWinAmount > 0 ? totalWinAmount : 0) : totalWinAmount / totalLossAmount;

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

  // AI Global Context Heartbeat - Dashboard Stats
  useEffect(() => {
    if (stats.totalTrades > 0) {
      window.dispatchEvent(new CustomEvent('nexus-global-context', {
        detail: {
          source: 'Live Dashboard Stats',
          data: `Current ${timeFilter} stats: Total Profit ${formatCurrency(stats.totalProfit)}, Win Rate ${formatPercent(stats.winRate)}, Profit Factor ${stats.profitFactor.toFixed(2)}, Total Trades ${stats.totalTrades}, Max Drawdown ${formatCurrency(stats.maxDD)}.`
        }
      }));
    }
  }, [stats, timeFilter]);

  const cards = [
    { label: 'Total Profit', value: formatCurrency(stats.totalProfit), icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10', sub: `${stats.totalTrades} trades` },
    { label: 'Win Rate', value: formatPercent(stats.winRate), icon: Activity, color: 'text-blue-500', bg: 'bg-blue-500/10', sub: `${(stats.winRate * 100).toFixed(1)}% accuracy` },
    { label: 'Profit Factor', value: stats.profitFactor.toFixed(2), icon: Zap, color: 'text-orange-500', bg: 'bg-orange-500/10', sub: 'Gross P/L ratio' },
    { label: 'Expectancy', value: formatCurrency(stats.expectancy), icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-500/10', sub: 'Per trade value' },
  ];

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (stats.totalTrades === 0) return;

      const cacheKey = `dashboard_data_${userId}_${isDemoMode ? 'demo' : 'real'}`;
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
        setUpcomingEvents(data.events || []);
        setAiBriefing(data.briefing || "Ready for another profitable session? Stick to your plan!");
        setCache(cacheKey, data, contextHash);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setAiBriefing("AI Briefing unavailable. High-impact news may be volatile today—trade safe.");
      } finally {
        setLoadingEvents(false);
        setIsBriefingLoading(false);
      }
    };

    fetchDashboardData();
  }, [userId, stats.totalTrades, timeFilter]);

  const handleSeedData = async () => {
    const effectiveUserId = user?.uid || userId;
    let effectiveAccountId = accountId;

    if (!effectiveUserId || ((window as any).__isSeeding)) return;
    
    (window as any).__isSeeding = true;
    setLoadingEvents(true);

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
          
          await addDoc(collection(db, 'users', effectiveUserId, 'accounts', effectiveAccountId, 'trades'), {
            userId: effectiveUserId,
            accountId: effectiveAccountId,
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
            isDemo: true
          });
        }
      }
      alert('Sample trades generated successfully!');
    } catch (error: any) {
      console.error('Seeding error:', error);
      alert(`Failed to generate sample data: ${error.message || 'Unknown error'}`);
    } finally {
      (window as any).__isSeeding = false;
      setLoadingEvents(false);
    }
  };

  const [recentWebhooks, setRecentWebhooks] = useState<any[]>([]);
  const [persistentLogs, setPersistentLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!userId) return;
    
    // Live debug buffer (global)
    const fetchWebhooks = async () => {
      try {
        const res = await fetch('/api/debug-webhooks');
        const data = await res.json();
        setRecentWebhooks(data.slice(0, 3));
      } catch (e) {
        console.error("Failed to fetch debug webhooks", e);
      }
    };

    // User-specific persistent logs
    const logsQuery = query(
      collection(db, 'users', userId, 'webhook_logs'),
      orderBy('timestamp', 'desc'),
      limit(3)
    );
    const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
       setPersistentLogs(snapshot.docs.map(d => d.data()));
    }, (error) => {
       handleFirestoreError(error, OperationType.LIST, 'webhook_logs');
    });

    fetchWebhooks();
    const interval = setInterval(fetchWebhooks, 5000);
    return () => {
      clearInterval(interval);
      unsubscribeLogs();
    };
  }, [userId]);

  return (
    <div className="space-y-8">
      {/* Real-time Connection Status - Always visible if account exists */}
      {activeAccount && (
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4 sm:p-6 animate-in fade-in duration-500">
           <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <RefreshCw size={20} className={cn((activeAccount.lastSync) && "animate-spin-slow")} />
            </div>
            <div className="flex-1 min-w-[150px]">
              <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-500">Sync Status</span>
                {activeAccount.lastSync ? (
                  <span className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold text-emerald-500">
                    <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 animate-pulse" />
                    CONNECTED 
                    <span className="hidden sm:inline opacity-50">•</span>
                    <span className="hidden xs:inline">#{activeAccount.accountNumber}</span>
                  </span>
                ) : (
                  <span className="text-[9px] sm:text-[10px] font-bold text-zinc-500 italic">No Sync Detected</span>
                )}
              </div>
              <p className="text-xs sm:text-sm font-medium text-zinc-100 truncate">
                {activeAccount.lastSync 
                  ? `Authenticated & Active` 
                  : "Sync EA Required"}
              </p>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="ml-auto flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[10px] font-bold text-zinc-400 transition-all hover:border-zinc-700 hover:text-zinc-100 active:scale-95"
            >
              <RefreshCw size={12} />
              Refresh Sync
            </button>
          </div>

          {/* Webhook Activity Feed (The "Connection" evidence) */}
          <div className="space-y-2 border-t border-zinc-800/50 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Terminal Sync Logs</span>
              {(persistentLogs.length > 0 || recentWebhooks.length > 0) && (
                 <span className="text-[9px] text-emerald-500/70 font-mono italic">real-time monitoring active</span>
              )}
            </div>
            
            {persistentLogs.length > 0 ? (
              <div className="space-y-1.5 text-[11px] font-mono">
                {persistentLogs.map((log, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded bg-black/20 p-2 text-emerald-400 border-l border-emerald-500">
                    <span className="text-emerald-500/50 shrink-0">[{log.timestamp?.split('T')[1]?.split('.')[0]}]</span>
                    <span className="truncate flex-1 min-w-[120px]">SUCCESS: Data packet received</span>
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="rounded bg-zinc-800 px-1 text-[9px] text-zinc-400 whitespace-nowrap">
                        {log.itemCount} items
                      </span>
                      <span className="text-zinc-500 hidden sm:inline">[{log.clientIp}]</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : recentWebhooks.length > 0 ? (
              <div className="space-y-1.5 text-[11px] font-mono opacity-50 grayscale">
                <p className="text-[9px] text-zinc-600 mb-1">Incoming Webhooks (External/Global):</p>
                {recentWebhooks.map((log, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded bg-black/10 p-2 text-zinc-500">
                    <span className="shrink-0">[{log.time?.split('T')[1]?.split('.')[0]}]</span>
                    <span className="truncate flex-1 min-w-[120px]">Global Webhook Detected</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-center">
                <p className="text-[10px] text-zinc-600 italic">Waiting for MetaTrader to send data... (Server listening on /api/webhook/trade)</p>
              </div>
            )}
          </div>
        </div>
      )}

      {trades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-6 animate-in fade-in duration-700">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500/10 text-emerald-500">
            <TrendingUp size={40} />
          </div>
          <div className="max-w-md space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">
              {isDemoMode ? "No Demo Trades Found" : "Welcome to TradeFlow"}
            </h2>
            <p className="text-zinc-400 text-sm">
              {isDemoMode 
                ? "You haven't generated any sample data yet. Click below to populate your dashboard with realistic trades."
                : "Your trading journal is currently empty. Our system is standing by to receive your MT5 trades."}
            </p>
            
            {(totalAccountTrades !== null && totalAccountTrades > 0) && (
              <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-amber-500">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <ShieldAlert size={16} />
                  <p className="text-xs font-bold uppercase tracking-wider">Sync Detection</p>
                </div>
                <p className="text-[11px] leading-relaxed">
                  We detected trades in this account document, but they are flagged as <b>{isDemoMode ? "Real" : "Demo"}</b>. 
                  Try switching the <b>{isDemoMode ? "Real/Demo" : "Real/Demo"}</b> toggle in the top right to see your synced data.
                </p>
              </div>
            )}

            {/* Sub-account availability check */}
            {trades.length === 0 && !isDemoMode && (
               <div className="mt-2 text-[10px] text-zinc-500 italic">
                 No trades found for this account. Ensure your MT5 EA is connected and has synced trades.
               </div>
            )}

            {/* NEW: Accounts with trades suggestion */}
            {(!selectedAccountId || !accountsWithTrades.includes(selectedAccountId || '')) && accountsWithTrades.length > 0 && (
              <div className="mt-6 space-y-3">
                <div className="h-px bg-zinc-800 w-1/2 mx-auto" />
                <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Suggested Accounts with Data</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {accountsWithTrades.map(id => {
                    const acc = accounts.find(a => a.id === id);
                    if (!acc) return null;
                    return (
                      <button
                        key={id}
                        onClick={() => setSelectedAccountId(id)}
                        className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs font-medium text-emerald-400 transition-all hover:bg-emerald-500/10"
                      >
                         <Database size={12} />
                         {acc.name || acc.accountNumber}
                         <ChevronRight size={12} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            {isDemoMode ? (
              <button
                onClick={handleSeedData}
                disabled={loadingEvents}
                className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-3 text-sm font-bold text-zinc-100 transition-all hover:bg-zinc-800 active:scale-95 disabled:opacity-50"
              >
                {loadingEvents ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap size={18} className="text-emerald-500" />}
                Generate Sample Data
              </button>
            ) : (
              <button
                onClick={onOpenTradeForm}
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-95"
              >
                <PlusCircle size={18} />
                Log First Trade
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Header with Time Filter */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                <Activity size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <h2 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight truncate">Trading Overview</h2>
                  {activeAccount && (
                    <span className="shrink-0 flex items-center gap-1 text-[9px] sm:text-[10px] md:text-xs font-mono text-emerald-500 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 sm:px-2.5 py-0.5 rounded-full">
                      <Database size={8} className="sm:w-2.5 sm:h-2.5" />
                      #{activeAccount.accountNumber}
                    </span>
                  )}
                </div>
                <p className="text-[10px] sm:text-xs md:text-sm text-zinc-400">Track your performance and goals</p>
              </div>
            </div>
            <Dropdown
              className="w-full sm:w-32"
              options={[
                { id: '30d', label: 'Last 30 Days' },
                { id: '90d', label: 'Last 90 Days' },
                { id: 'all', label: 'All Time' }
              ]}
              value={timeFilter}
              onChange={(v) => setTimeFilter(v as any)}
              triggerClassName="h-10 !bg-zinc-900/50 !border-zinc-800 hover:!border-zinc-700"
            />
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
        </>
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
                    "flex flex-col sm:flex-row sm:items-center items-start justify-between rounded-lg p-3 sm:p-2 gap-2 transition-colors",
                    isNoTrade ? "bg-rose-500/10 border border-rose-500/20" : "bg-zinc-950/50"
                  )}>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-[10px] font-bold text-zinc-500">{event.currency} • {format(eventDate, 'HH:mm')}</span>
                      <span className="text-xs font-bold text-zinc-200 truncate">{event.event}</span>
                    </div>
                    {isNoTrade ? (
                      <div className="flex items-center gap-1 text-rose-500 animate-pulse bg-rose-500/10 px-2 py-1 rounded-md sm:bg-transparent sm:p-0">
                        <ShieldAlert size={12} />
                        <span className="text-[10px] font-bold uppercase">Alert</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-zinc-500 bg-zinc-800 px-2 py-1 rounded-md sm:bg-transparent sm:p-0">
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
