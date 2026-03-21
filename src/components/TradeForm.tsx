import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { TradeDirection, TradeStatus, Strategy } from '../types';
import { X, Save } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { formatCurrency, cn } from '../lib/utils';

interface TradeFormProps {
  userId: string;
  onClose: () => void;
}

export default function TradeForm({ userId, onClose }: TradeFormProps) {
  const [loading, setLoading] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [formData, setFormData] = useState({
    symbol: '',
    entryPrice: '',
    exitPrice: '',
    quantity: '',
    direction: 'LONG' as TradeDirection,
    status: 'OPEN' as TradeStatus,
    stopLoss: '',
    takeProfit: '',
    notes: '',
    entryTime: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    strategyId: '',
  });

  const calculatePnL = () => {
    const entry = parseFloat(formData.entryPrice);
    const exit = parseFloat(formData.exitPrice);
    const qty = parseFloat(formData.quantity);
    
    if (isNaN(entry) || isNaN(exit) || isNaN(qty)) return null;
    
    if (formData.direction === 'LONG') {
      return (exit - entry) * qty;
    } else {
      return (entry - exit) * qty;
    }
  };

  const currentPnL = calculatePnL();

  useEffect(() => {
    const fetchStrategies = async () => {
      try {
        const q = query(collection(db, 'strategies'), where('userId', '==', userId));
        const snapshot = await getDocs(q);
        setStrategies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Strategy)));
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'strategies');
      }
    };
    fetchStrategies();
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const entryPrice = parseFloat(formData.entryPrice);
      const exitPrice = formData.exitPrice ? parseFloat(formData.exitPrice) : undefined;
      const quantity = parseFloat(formData.quantity);
      const stopLoss = formData.stopLoss ? parseFloat(formData.stopLoss) : undefined;
      const takeProfit = formData.takeProfit ? parseFloat(formData.takeProfit) : undefined;
      const pnl = currentPnL !== null ? currentPnL : undefined;
      
      const entryTime = formData.entryTime ? new Date(formData.entryTime).toISOString() : new Date().toISOString();

      await addDoc(collection(db, 'trades'), {
        userId,
        symbol: formData.symbol.toUpperCase(),
        entryPrice,
        exitPrice,
        quantity,
        direction: formData.direction,
        status: formData.status,
        pnl,
        entryTime,
        exitTime: formData.status === 'CLOSED' ? new Date().toISOString() : undefined,
        stopLoss,
        takeProfit,
        notes: formData.notes,
        strategyId: formData.strategyId || undefined,
      });

      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'trades');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold">Log New Trade</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Symbol</label>
              <input
                required
                type="text"
                placeholder="BTC/USD"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Direction</label>
              <select
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={formData.direction}
                onChange={(e) => setFormData({ ...formData, direction: e.target.value as TradeDirection })}
              >
                <option value="LONG">Long</option>
                <option value="SHORT">Short</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Entry Price</label>
              <input
                required
                type="number"
                step="any"
                placeholder="0.00"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={formData.entryPrice}
                onChange={(e) => setFormData({ ...formData, entryPrice: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Quantity</label>
              <input
                required
                type="number"
                step="any"
                placeholder="1.0"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Status</label>
              <select
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as TradeStatus })}
              >
                <option value="OPEN">Open</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Exit Price (Optional)</label>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                disabled={formData.status === 'OPEN'}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                value={formData.exitPrice}
                onChange={(e) => setFormData({ ...formData, exitPrice: e.target.value })}
              />
              {formData.status === 'CLOSED' && formData.exitPrice && currentPnL !== null && (
                <div className={cn(
                  "text-xs font-bold mt-1",
                  currentPnL >= 0 ? "text-emerald-400" : "text-rose-400"
                )}>
                  Estimated PnL: {formatCurrency(currentPnL)}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Stop Loss</label>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={formData.stopLoss}
                onChange={(e) => setFormData({ ...formData, stopLoss: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Take Profit</label>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={formData.takeProfit}
                onChange={(e) => setFormData({ ...formData, takeProfit: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Entry Time</label>
              <input
                type="datetime-local"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={formData.entryTime}
                onChange={(e) => setFormData({ ...formData, entryTime: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Strategy</label>
              <select
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={formData.strategyId}
                onChange={(e) => setFormData({ ...formData, strategyId: e.target.value })}
              >
                <option value="">No Strategy</option>
                {strategies.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Notes</label>
            <textarea
              rows={3}
              placeholder="Trade rationale, emotions, strategy..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-zinc-800 py-3 text-sm font-medium hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-950 border-t-transparent" /> : <Save size={18} />}
              Save Trade
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
