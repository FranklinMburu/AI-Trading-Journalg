import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, onSnapshot, deleteDoc, doc, getDocs, updateDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Trade, Strategy } from '../types';
import { formatCurrency } from '../lib/utils';
import { Trash2, Calendar, Tag, History as HistoryIcon, Target, AlertTriangle, X as XIcon, Search, Filter, Download, CheckCircle2, BookOpen, RefreshCw, Shield } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { UserSettings } from '../types';

export default function TradeList({ userId, onJournalTrade }: { userId: string, onJournalTrade?: (id: string) => void }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<Map<string, string>>(new Map());
  const [tradeToDelete, setTradeToDelete] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterDirection, setFilterDirection] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selectedPairs, setSelectedPairs] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const settingsQuery = query(collection(db, 'settings'), where('userId', '==', userId));
    const unsubscribeSettings = onSnapshot(settingsQuery, (snapshot) => {
      if (!snapshot.empty) {
        setSettings(snapshot.docs[0].data() as UserSettings);
      }
    });

    const strategiesQuery = query(collection(db, 'strategies'), where('userId', '==', userId));
    const unsubscribeStrategies = onSnapshot(strategiesQuery, (snapshot) => {
      const sMap = new Map<string, string>();
      snapshot.docs.forEach(doc => sMap.set(doc.id, (doc.data() as Strategy).name));
      setStrategies(sMap);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'strategies');
    });

    const tradesQuery = query(
      collection(db, 'trades'),
      where('userId', '==', userId),
      orderBy('entryTime', 'desc')
    );

    const unsubscribeTrades = onSnapshot(tradesQuery, (snapshot) => {
      setTrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trade)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trades');
    });

    return () => {
      unsubscribeStrategies();
      unsubscribeTrades();
      unsubscribeSettings();
    };
  }, [userId]);

  const handleBrokerSync = async () => {
    if (!settings?.brokerConfig?.isActive || !settings.brokerConfig.metaApiToken || !settings.brokerConfig.accountId) {
      alert('Please configure and enable your Broker Connection in Settings first.');
      return;
    }

    setSyncing(true);
    try {
      const response = await fetch('/api/broker/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          metaApiToken: settings.brokerConfig.metaApiToken,
          accountId: settings.brokerConfig.accountId
        })
      });

      const data = await response.json();
      if (data.success) {
        alert(data.message);
      } else {
        throw new Error(data.error || 'Sync failed');
      }
    } catch (error) {
      console.error('Broker sync error:', error);
      alert('Failed to sync with broker. Please check your MetaApi credentials in Settings.');
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async () => {
    if (!tradeToDelete) return;
    try {
      await deleteDoc(doc(db, 'trades', tradeToDelete));
      setTradeToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'trades');
    }
  };

  const handleCloseTrade = async (trade: Trade) => {
    if (!trade.id) return;
    const exitPrice = prompt('Enter exit price:');
    if (!exitPrice) return;

    const exit = parseFloat(exitPrice);
    if (isNaN(exit)) return;

    const pnl = trade.direction === 'LONG' 
      ? (exit - trade.entryPrice) * trade.quantity
      : (trade.entryPrice - exit) * trade.quantity;

    try {
      await updateDoc(doc(db, 'trades', trade.id), {
        status: 'CLOSED',
        exitPrice: exit,
        exitTime: new Date().toISOString(),
        pnl
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'trades');
    }
  };

  const handleCloseAll = async () => {
    const openTrades = trades.filter(t => t.status === 'OPEN');
    if (openTrades.length === 0) return;
    
    const exitPrice = prompt(`Enter exit price for ALL ${openTrades.length} trades:`);
    if (!exitPrice) return;
    const exit = parseFloat(exitPrice);
    if (isNaN(exit)) return;

    const batch = writeBatch(db);
    openTrades.forEach(trade => {
      if (!trade.id) return;
      const pnl = trade.direction === 'LONG' 
        ? (exit - trade.entryPrice) * trade.quantity
        : (trade.entryPrice - exit) * trade.quantity;
      
      batch.update(doc(db, 'trades', trade.id), {
        status: 'CLOSED',
        exitPrice: exit,
        exitTime: new Date().toISOString(),
        pnl
      });
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'trades');
    }
  };

  const exportToCSV = () => {
    const headers = ['Symbol', 'Direction', 'Status', 'Entry Price', 'Exit Price', 'Quantity', 'PnL', 'Entry Time', 'Exit Time', 'Notes'];
    const rows = trades.map(t => [
      t.symbol,
      t.direction,
      t.status,
      t.entryPrice,
      t.exitPrice || '',
      t.quantity,
      t.pnl || 0,
      t.entryTime,
      t.exitTime || '',
      t.notes || ''
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `trades_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredTrades = trades.filter(t => {
    const matchesSearch = t.symbol.toLowerCase().includes(search.toLowerCase()) || 
                         (t.notes?.toLowerCase().includes(search.toLowerCase()));
    const matchesDirection = filterDirection === 'ALL' || t.direction === filterDirection;
    const matchesStatus = filterStatus === 'ALL' || t.status === filterStatus;
    const matchesPair = selectedPairs.length === 0 || selectedPairs.includes(t.symbol);
    
    return matchesSearch && matchesDirection && matchesStatus && matchesPair;
  });

  const uniquePairs = Array.from(new Set(trades.map(t => t.symbol)));

  const filteredStats = useMemo(() => {
    const closed = filteredTrades.filter(t => t.status === 'CLOSED');
    const pnl = closed.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const wins = closed.filter(t => (t.pnl || 0) > 0).length;
    const wr = closed.length > 0 ? (wins / closed.length) * 100 : 0;
    const maxPnL = Math.max(...closed.map(t => Math.abs(t.pnl || 0)), 1);
    
    return { pnl, wr, count: closed.length, maxPnL };
  }, [filteredTrades]);

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Filtered PnL</p>
          <p className={cn("text-xl font-bold", filteredStats.pnl >= 0 ? "text-emerald-500" : "text-rose-500")}>
            {formatCurrency(filteredStats.pnl)}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Filtered Win Rate</p>
          <p className="text-xl font-bold text-blue-500">{filteredStats.wr.toFixed(1)}%</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Trade Count</p>
          <p className="text-xl font-bold text-zinc-100">{filteredStats.count} Closed / {filteredTrades.length - filteredStats.count} Open</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-bold">Trade History</h3>
          <p className="text-sm text-zinc-400">{filteredTrades.length} trades found</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input
              type="text"
              placeholder="Search trades..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 pl-10 pr-4 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={cn(
              "flex items-center gap-2 rounded-xl border border-zinc-800 px-4 py-2 text-sm font-medium transition-all hover:bg-zinc-800",
              (isFilterOpen || filterDirection !== 'ALL' || filterStatus !== 'ALL' || selectedPairs.length > 0) && "bg-zinc-800 border-emerald-500/50"
            )}
          >
            <Filter size={16} className={cn((filterDirection !== 'ALL' || filterStatus !== 'ALL' || selectedPairs.length > 0) && "text-emerald-500")} />
            Filters
            {(filterDirection !== 'ALL' || filterStatus !== 'ALL' || selectedPairs.length > 0) && (
              <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-zinc-950">
                {(filterDirection !== 'ALL' ? 1 : 0) + (filterStatus !== 'ALL' ? 1 : 0) + (selectedPairs.length > 0 ? 1 : 0)}
              </span>
            )}
          </button>
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 rounded-xl border border-zinc-800 px-4 py-2 text-sm font-medium transition-all hover:bg-zinc-800"
          >
            <Download size={16} />
            Export
          </button>
          {trades.some(t => t.status === 'OPEN') && (
            <button 
              onClick={handleCloseAll}
              className="flex items-center gap-2 rounded-xl bg-blue-500/10 px-4 py-2 text-sm font-bold text-blue-500 transition-all hover:bg-blue-500/20"
            >
              <CheckCircle2 size={16} />
              Close All Open
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isFilterOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6">
              <div className="mb-6 flex items-center justify-between">
                <h4 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Filter Trades</h4>
                {(filterDirection !== 'ALL' || filterStatus !== 'ALL' || selectedPairs.length > 0) && (
                  <button 
                    onClick={() => {
                      setFilterDirection('ALL');
                      setFilterStatus('ALL');
                      setSelectedPairs([]);
                    }}
                    className="text-xs font-bold text-rose-500 hover:text-rose-400"
                  >
                    Reset All Filters
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Direction</label>
                  <div className="flex gap-2">
                    {['ALL', 'LONG', 'SHORT'].map(d => (
                      <button
                        key={d}
                        onClick={() => setFilterDirection(d)}
                        className={cn(
                          "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                          filterDirection === d ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Status</label>
                  <div className="flex gap-2">
                    {['ALL', 'OPEN', 'CLOSED'].map(s => (
                      <button
                        key={s}
                        onClick={() => setFilterStatus(s)}
                        className={cn(
                          "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                          filterStatus === s ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Pairs</label>
                  <div className="flex flex-wrap gap-2">
                    {uniquePairs.map(p => (
                      <button
                        key={p}
                        onClick={() => {
                          setSelectedPairs(prev => 
                            prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
                          );
                        }}
                        className={cn(
                          "rounded-lg px-2 py-1 text-[10px] font-bold uppercase transition-all",
                          selectedPairs.includes(p) ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-4">
        <AnimatePresence mode="popLayout">
          {filteredTrades.map((trade) => (
            <motion.div 
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              key={trade.id} 
              className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 transition-all hover:border-zinc-700 hover:bg-zinc-900"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3 sm:items-center sm:gap-4">
                  <div className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold sm:h-12 sm:w-12",
                    trade.direction === 'LONG' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                  )}>
                    {trade.symbol.slice(0, 2)}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <h4 className="text-base font-bold sm:text-lg">{trade.symbol}</h4>
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider sm:text-[10px]",
                        trade.direction === 'LONG' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                      )}>
                        {trade.direction}
                      </span>
                      {trade.status === 'OPEN' && (
                        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-500 sm:text-[10px]">
                          OPEN
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-500 sm:text-xs">
                      <span className="flex items-center gap-1">
                        <Calendar size={10} className="sm:size-[12px]" />
                        {format(new Date(trade.entryTime), 'MMM d, HH:mm')}
                      </span>
                      {trade.tags && trade.tags.length > 0 && (
                        <span className="hidden items-center gap-1 sm:flex">
                          <Tag size={12} />
                          {trade.tags.join(', ')}
                        </span>
                      )}
                      {trade.strategyId && strategies.has(trade.strategyId) && (
                        <span className="flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-500">
                          <Target size={10} className="sm:size-[12px]" />
                          {strategies.get(trade.strategyId)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-zinc-800/50 pt-4 sm:border-t-0 sm:pt-0 sm:justify-end sm:gap-6">
                  <div className="hidden lg:block w-32 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        (trade.pnl || 0) >= 0 ? "bg-emerald-500" : "bg-rose-500"
                      )}
                      style={{ 
                        width: `${Math.min(100, (Math.abs(trade.pnl || 0) / filteredStats.maxPnL) * 100)}%`,
                        marginLeft: (trade.pnl || 0) >= 0 ? '0' : 'auto'
                      }}
                    />
                  </div>
                  <div className="text-left sm:text-right min-w-[80px]">
                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider sm:text-[10px]">PnL</p>
                    <p className={cn(
                      "text-base font-bold sm:text-lg",
                      (trade.pnl || 0) > 0 ? "text-emerald-500" : (trade.pnl || 0) < 0 ? "text-rose-500" : "text-zinc-400"
                    )}>
                      {trade.pnl ? formatCurrency(trade.pnl) : '-'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {trade.status === 'OPEN' && (
                      <button 
                        onClick={() => handleCloseTrade(trade)}
                        className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500 transition-all hover:bg-emerald-500 hover:text-zinc-950"
                        title="Close Trade"
                      >
                        <CheckCircle2 size={18} />
                      </button>
                    )}
                    {onJournalTrade && (
                      <button 
                        onClick={() => trade.id && onJournalTrade(trade.id)}
                        className="rounded-lg bg-zinc-800 p-2 text-zinc-400 transition-all hover:bg-emerald-500/10 hover:text-emerald-500"
                        title="Journal this trade"
                      >
                        <BookOpen size={18} />
                      </button>
                    )}
                    <button 
                      onClick={() => trade.id && setTradeToDelete(trade.id)}
                      className="rounded-lg p-2 text-zinc-500 transition-all hover:bg-rose-500/10 hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
              
              {trade.notes && (
                <div className="mt-4 border-t border-zinc-800 pt-4">
                  <p className="text-sm text-zinc-400 italic">"{trade.notes}"</p>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredTrades.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <HistoryIcon size={48} className="mb-4 opacity-20" />
            <p>No trades found matching your filters.</p>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {tradeToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-zinc-800 p-4">
              <div className="flex items-center gap-2 text-rose-500">
                <AlertTriangle size={20} />
                <h3 className="font-bold">Delete Trade</h3>
              </div>
              <button 
                onClick={() => setTradeToDelete(null)}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <XIcon size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-zinc-300">
                Are you sure you want to delete this trade? This action cannot be undone and will remove all associated data from your journal.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 bg-zinc-900/50 p-4">
              <button 
                onClick={() => setTradeToDelete(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                Cancel
              </button>
              <button 
                onClick={handleDelete}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
