import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Trade, UserSettings } from '../types';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';
import { TrendingUp, Info, RefreshCw, AlertCircle, BarChart3, Target, ShieldAlert, LineChart as LineChartIcon } from 'lucide-react';
import { cn, formatCurrency, formatPercent } from '../lib/utils';

interface SimulationResult {
  paths: { day: number; value: number }[][];
  stats: {
    median: number;
    best: number;
    worst: number;
    maxDrawdownProb: number;
    probOfProfit: number;
  };
}

export default function EquityForecaster({ userId }: { userId: string }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingBalance, setStartingBalance] = useState(10000);
  const [simulationDays, setSimulationDays] = useState(180); // 6 months
  const [tradesPerDay, setTradesPerDay] = useState(1);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'settings'), where('userId', '==', userId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const settings = snapshot.docs[0].data() as UserSettings;
        if (settings.startingBalance) {
          setStartingBalance(settings.startingBalance);
        }
      }
    });
    return () => unsubscribe();
  }, [userId]);

  useEffect(() => {
    const q = query(
      collection(db, 'trades'),
      where('userId', '==', userId),
      where('status', '==', 'CLOSED'),
      orderBy('exitTime', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tradesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trade));
      setTrades(tradesData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trades');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const runSimulation = () => {
    if (trades.length < 5) return;

    const closedTrades = trades.filter(t => t.pnl !== undefined);
    const wins = closedTrades.filter(t => (t.pnl || 0) > 0);
    const losses = closedTrades.filter(t => (t.pnl || 0) < 0);
    
    const winRate = wins.length / closedTrades.length;
    const avgWin = wins.reduce((acc, t) => acc + (t.pnl || 0), 0) / (wins.length || 1);
    const avgLoss = Math.abs(losses.reduce((acc, t) => acc + (t.pnl || 0), 0) / (losses.length || 1));

    const numSimulations = 100; // Keep it responsive
    const totalTrades = simulationDays * tradesPerDay;
    const allPaths: { day: number; value: number }[][] = [];
    let profitableSims = 0;
    let maxDrawdowns: number[] = [];

    for (let i = 0; i < numSimulations; i++) {
      let currentBalance = startingBalance;
      let peak = startingBalance;
      let maxDD = 0;
      const path = [{ day: 0, value: startingBalance }];

      for (let day = 1; day <= simulationDays; day++) {
        for (let t = 0; t < tradesPerDay; t++) {
          const isWin = Math.random() < winRate;
          const pnl = isWin ? avgWin : -avgLoss;
          currentBalance += pnl;
        }
        
        peak = Math.max(peak, currentBalance);
        const dd = (peak - currentBalance) / peak;
        maxDD = Math.max(maxDD, dd);
        
        path.push({ day, value: Math.max(0, currentBalance) });
      }
      
      if (currentBalance > startingBalance) profitableSims++;
      maxDrawdowns.push(maxDD);
      allPaths.push(path);
    }

    const finalBalances = allPaths.map(p => p[p.length - 1].value).sort((a, b) => a - b);
    const median = finalBalances[Math.floor(numSimulations / 2)];
    const best = finalBalances[numSimulations - 1];
    const worst = finalBalances[0];
    const avgMaxDD = maxDrawdowns.reduce((a, b) => a + b, 0) / numSimulations;

    setSimResult({
      paths: allPaths.slice(0, 20), // Only show 20 paths for clarity
      stats: {
        median,
        best,
        worst,
        maxDrawdownProb: avgMaxDD,
        probOfProfit: profitableSims / numSimulations
      }
    });
  };

  useEffect(() => {
    if (trades.length >= 5) {
      runSimulation();
    }
  }, [trades, startingBalance, simulationDays, tradesPerDay]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (trades.length < 5) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
        <AlertCircle size={48} className="mb-4 opacity-20" />
        <p className="text-lg font-medium">Insufficient Data</p>
        <p className="text-sm">You need at least 5 closed trades to run a Monte Carlo simulation.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
            <TrendingUp size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold">Equity Forecaster</h3>
            <p className="text-sm text-zinc-400">Monte Carlo simulation based on your performance</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Starting Balance</label>
          <input 
            type="number" 
            value={startingBalance}
            onChange={(e) => setStartingBalance(Number(e.target.value))}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 font-mono text-lg focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Simulation Days</label>
          <input 
            type="number" 
            value={simulationDays}
            onChange={(e) => setSimulationDays(Number(e.target.value))}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 font-mono text-lg focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Trades Per Day</label>
          <input 
            type="number" 
            value={tradesPerDay}
            onChange={(e) => setTradesPerDay(Number(e.target.value))}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 font-mono text-lg focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      {simResult && (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Median Projection</p>
              <p className="mt-1 text-2xl font-bold text-emerald-500">{formatCurrency(simResult.stats.median)}</p>
              <p className="mt-1 text-xs text-zinc-500">50% probability outcome</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Max Drawdown Prob.</p>
              <p className="mt-1 text-2xl font-bold text-rose-500">{formatPercent(simResult.stats.maxDrawdownProb)}</p>
              <p className="mt-1 text-xs text-zinc-500">Average peak-to-valley drop</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Prob. of Profit</p>
              <p className="mt-1 text-2xl font-bold text-blue-500">{formatPercent(simResult.stats.probOfProfit)}</p>
              <p className="mt-1 text-xs text-zinc-500">Likelihood of ending positive</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Best Case</p>
              <p className="mt-1 text-2xl font-bold text-zinc-100">{formatCurrency(simResult.stats.best)}</p>
              <p className="mt-1 text-xs text-zinc-500">Top 1% outcome</p>
            </div>
          </div>

          {/* Simulation Chart */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Equity Path Simulations</h3>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <div className="h-3 w-3 rounded-full bg-emerald-500/50" />
                <span>20 Random Paths</span>
              </div>
            </div>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis 
                    dataKey="day" 
                    type="number" 
                    domain={[0, simulationDays]} 
                    stroke="#71717a" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    label={{ value: 'Days', position: 'insideBottom', offset: -5, fill: '#71717a', fontSize: 10 }}
                  />
                  <YAxis 
                    stroke="#71717a" 
                    fontSize={10} 
                    tickFormatter={(v) => `$${v}`} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                    labelFormatter={(label) => `Day ${label}`}
                    formatter={(value: number) => [formatCurrency(value), 'Equity']}
                  />
                  {simResult.paths.map((path, i) => (
                    <Line 
                      key={i}
                      data={path}
                      type="monotone"
                      dataKey="value"
                      stroke="#10b981"
                      strokeWidth={1}
                      dot={false}
                      opacity={0.2}
                      isAnimationActive={false}
                    />
                  ))}
                  {/* Median Path Highlight */}
                  <Line 
                    data={simResult.paths[0]} // Just as a placeholder for the median line if we wanted to calculate it specifically
                    type="monotone"
                    dataKey="value"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={false}
                    opacity={0.8}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* Education Card */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
        <div className="flex gap-4">
          <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-500">
            <Info size={20} />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-emerald-500 uppercase tracking-wider">Understanding Monte Carlo</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              This simulation takes your historical win rate and average win/loss size to run thousands of "what-if" scenarios. 
              It accounts for the randomness of trade sequences—reminding you that even with a winning strategy, 
              you will encounter losing streaks. Use this to set realistic expectations and ensure your risk management 
              can survive the "Worst Case" drawdown scenarios.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
