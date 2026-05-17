import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { TradeDirection, TradeStatus, Strategy } from '../types';
import { X, Save, Calculator, Shield, Brain, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, cn, calculateTradePnL } from '../lib/utils';
import RiskCalculator from './RiskCalculator';
import { generateContent, AI_MODELS } from '../services/aiService';
import Markdown from 'react-markdown';

interface TradeFormProps {
  userId: string;
  accountId?: string;
  isDemoMode: boolean;
  onClose: () => void;
}

import { useAccount } from '../contexts/AccountContext';

export default function TradeForm({ isDemoMode, onClose }: { isDemoMode: boolean; onClose: () => void }) {
  const { activeAccount, selectedAccountId, user } = useAccount();
  const userId = activeAccount?.userId;
  const accountId = selectedAccountId;

  const [loading, setLoading] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [showRiskCalc, setShowRiskCalc] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    symbol: '',
    accountId: accountId || '',
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
    tags: '',
  });

  useEffect(() => {
    if (!userId || !accountId) return;

    const fetchStrategies = async () => {
      try {
        const q = accountId?.startsWith('DEMO_')
          ? query(
              collection(db, 'users', userId, 'accounts', accountId, 'strategies'), 
              where('isDemo', '==', isDemoMode)
            )
          : query(
              collection(db, 'users', userId, 'accounts', accountId, 'strategies')
            );
        const snapshot = await getDocs(q);
        setStrategies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Strategy)));
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'strategies');
      }
    };
    fetchStrategies();
  }, [userId, accountId, isDemoMode]);

  const calculatePnL = () => {
    const entry = parseFloat(formData.entryPrice);
    const exit = parseFloat(formData.exitPrice);
    const qty = parseFloat(formData.quantity);
    
    if (isNaN(entry) || isNaN(exit) || isNaN(qty)) return null;
    
    return calculateTradePnL(entry, exit, qty, formData.direction);
  };

  const calculateRisk = () => {
    const entry = parseFloat(formData.entryPrice);
    const sl = parseFloat(formData.stopLoss);
    const qty = parseFloat(formData.quantity);
    
    if (isNaN(entry) || isNaN(sl) || isNaN(qty)) return null;
    
    if (formData.direction === 'LONG') {
      return (entry - sl) * qty;
    } else {
      return (sl - entry) * qty;
    }
  };

  const calculateReward = () => {
    const entry = parseFloat(formData.entryPrice);
    const tp = parseFloat(formData.takeProfit);
    const qty = parseFloat(formData.quantity);
    
    if (isNaN(entry) || isNaN(tp) || isNaN(qty)) return null;
    
    if (formData.direction === 'LONG') {
      return (tp - entry) * qty;
    } else {
      return (entry - tp) * qty;
    }
  };

  const currentPnL = calculatePnL();
  const currentRisk = calculateRisk();
  const currentReward = calculateReward();
  const rrRatio = currentRisk && currentReward && currentRisk > 0 ? (currentReward / currentRisk).toFixed(2) : null;

  const isInvalidSL = () => {
    const entry = parseFloat(formData.entryPrice);
    const sl = parseFloat(formData.stopLoss);
    if (isNaN(entry) || isNaN(sl)) return false;
    return formData.direction === 'LONG' ? sl >= entry : sl <= entry;
  };

  const isInvalidTP = () => {
    const entry = parseFloat(formData.entryPrice);
    const tp = parseFloat(formData.takeProfit);
    if (isNaN(entry) || isNaN(tp)) return false;
    return formData.direction === 'LONG' ? tp <= entry : tp >= entry;
  };

  const getVisualizerData = () => {
    const entry = parseFloat(formData.entryPrice);
    const sl = parseFloat(formData.stopLoss);
    const tp = parseFloat(formData.takeProfit);
    if (isNaN(entry) || isNaN(sl) || isNaN(tp)) return null;

    const min = Math.min(entry, sl, tp);
    const max = Math.max(entry, sl, tp);
    const range = max - min;

    const getPos = (val: number) => ((val - min) / range) * 100;

    return {
      slPos: getPos(sl),
      entryPos: getPos(entry),
      tpPos: getPos(tp),
      isLong: formData.direction === 'LONG'
    };
  };

  const visualizer = getVisualizerData();

  const handleGetFeedback = async () => {
    if (isAnalyzing) return;
    
    const { symbol, direction, entryPrice, stopLoss, takeProfit, notes, strategyId } = formData;
    if (!symbol || !entryPrice || !notes) {
      alert("Please enter a symbol, entry price, and setup description (in notes) to get feedback.");
      return;
    }

    setIsAnalyzing(true);
    setAiFeedback(null);

    const selectedStrategy = strategies.find(s => s.id === strategyId);
    
    try {
      const prompt = `
        As an expert trading coach, analyze this potential trade setup and provide feedback.
        
        Trade Details:
        - Symbol: ${symbol}
        - Direction: ${direction}
        - Entry Price: ${entryPrice}
        - Stop Loss: ${stopLoss || 'Not set'}
        - Take Profit: ${takeProfit || 'Not set'}
        - R:R Ratio: 1:${rrRatio || 'N/A'}
        
        Setup Description / Rationale:
        "${notes}"
        
        ${selectedStrategy ? `
        Selected Strategy: ${selectedStrategy.name}
        Strategy Rules/Constraints:
        ${selectedStrategy.rules || 'No specific rules provided.'}
        ` : 'No specific strategy selected.'}
        
        Please evaluate:
        1. Logical validity of the setup (entry, SL, TP alignment).
        2. Quality of the rationale (are the reasons technically sound?).
        3. Alignment with the selected strategy (if applicable).
        4. Potential risks or things the trader might have missed.
        
        Keep the feedback concise, professional, and actionable. Use markdown for formatting.
      `;

      const response = await generateContent({
        model: AI_MODELS.FLASH,
        contents: prompt
      });

      setAiFeedback(response.text);
    } catch (error: any) {
      console.error("AI Feedback error:", error);
      setAiFeedback("Failed to get AI feedback. Please try again later.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveUserId = user?.uid || userId;
    if (loading || !effectiveUserId || !accountId) return;
    setLoading(true);

    try {
      const entryPrice = parseFloat(formData.entryPrice);
      const exitPrice = formData.exitPrice ? parseFloat(formData.exitPrice) : undefined;
      const quantity = parseFloat(formData.quantity);
      const stopLoss = formData.stopLoss ? parseFloat(formData.stopLoss) : undefined;
      const takeProfit = formData.takeProfit ? parseFloat(formData.takeProfit) : undefined;
      const pnl = currentPnL !== null ? currentPnL : undefined;
      
      const entryTime = formData.entryTime ? new Date(formData.entryTime).toISOString() : new Date().toISOString();
      const tags = formData.tags.split(',').map(t => t.trim()).filter(t => t !== '');

      await addDoc(collection(db, 'users', effectiveUserId, 'accounts', accountId, 'trades'), {
        userId: effectiveUserId,
        accountId: accountId,
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
        tags,
        isDemo: isDemoMode
      });

      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'trades');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="my-auto flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl max-h-[90vh]">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-6 py-4">
          <h2 className="text-xl font-bold">Log New Trade</h2>
          <button 
            onClick={onClose} 
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <form id="trade-form" onSubmit={handleSubmit} className="space-y-6">
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
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Quantity</label>
                  <button 
                    type="button"
                    onClick={() => setShowRiskCalc(!showRiskCalc)}
                    className={cn(
                      "flex items-center gap-1 text-[10px] font-bold transition-colors",
                      showRiskCalc ? "text-rose-400 hover:text-rose-300" : "text-emerald-500 hover:text-emerald-400"
                    )}
                  >
                    <Calculator size={10} />
                    {showRiskCalc ? 'Hide Calc' : 'Risk Calc'}
                  </button>
                </div>
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

            {showRiskCalc && (
              <div className="relative rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 animate-in slide-in-from-top duration-300">
                <button 
                  type="button"
                  onClick={() => setShowRiskCalc(false)}
                  className="absolute right-2 top-2 rounded-lg p-1 text-zinc-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                >
                  <X size={14} />
                </button>
                <RiskCalculator 
                  compact
                  entryPrice={parseFloat(formData.entryPrice) || undefined}
                  stopLossPrice={parseFloat(formData.stopLoss) || undefined}
                  onCalculate={(size) => setFormData(prev => ({ ...prev, quantity: size.toString() }))}
                />
              </div>
            )}

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
                    "text-xs font-bold mt-1.5 flex items-center justify-between px-1",
                    currentPnL >= 0 ? "text-emerald-400" : "text-rose-400"
                  )}>
                    <span>Estimated PnL:</span>
                    <span>{formatCurrency(currentPnL)}</span>
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
                  className={cn(
                    "w-full rounded-xl border bg-zinc-950 px-4 py-2.5 text-sm focus:outline-none focus:ring-1",
                    isInvalidSL() ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500" : "border-zinc-800 focus:border-emerald-500 focus:ring-emerald-500"
                  )}
                  value={formData.stopLoss}
                  onChange={(e) => setFormData({ ...formData, stopLoss: e.target.value })}
                />
                {isInvalidSL() && (
                  <p className="text-[10px] text-rose-500 font-bold">SL must be {formData.direction === 'LONG' ? 'below' : 'above'} entry</p>
                )}
                {currentRisk !== null && (
                  <div className="text-[10px] font-medium text-rose-400 mt-1 flex items-center justify-between">
                    <span>Risk:</span>
                    <span>{formatCurrency(currentRisk)} ({((currentRisk / (parseFloat(formData.entryPrice) * parseFloat(formData.quantity))) * 100).toFixed(2)}%)</span>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Take Profit</label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  className={cn(
                    "w-full rounded-xl border bg-zinc-950 px-4 py-2.5 text-sm focus:outline-none focus:ring-1",
                    isInvalidTP() ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500" : "border-zinc-800 focus:border-emerald-500 focus:ring-emerald-500"
                  )}
                  value={formData.takeProfit}
                  onChange={(e) => setFormData({ ...formData, takeProfit: e.target.value })}
                />
                {isInvalidTP() && (
                  <p className="text-[10px] text-rose-500 font-bold">TP must be {formData.direction === 'LONG' ? 'above' : 'below'} entry</p>
                )}
                {currentReward !== null && (
                  <div className="text-[10px] font-medium text-emerald-400 mt-1 flex items-center justify-between">
                    <span>Reward:</span>
                    <span>{formatCurrency(currentReward)} ({((currentReward / (parseFloat(formData.entryPrice) * parseFloat(formData.quantity))) * 100).toFixed(2)}%)</span>
                  </div>
                )}
              </div>
            </div>

            {visualizer && (
              <div className="space-y-2 py-2">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  <span>Setup Visualizer</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded bg-zinc-800",
                    parseFloat(rrRatio || '0') >= 2 ? "text-emerald-500" : "text-zinc-400"
                  )}>
                    R:R 1:{rrRatio}
                  </span>
                </div>
                <div className="relative h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div 
                    className={cn(
                      "absolute h-full transition-all duration-500",
                      visualizer.isLong ? "bg-emerald-500/20" : "bg-rose-500/20"
                    )}
                    style={{ 
                      left: `${Math.min(visualizer.slPos, visualizer.tpPos)}%`, 
                      width: `${Math.abs(visualizer.tpPos - visualizer.slPos)}%` 
                    }}
                  />
                  <div 
                    className="absolute top-0 h-full w-1 bg-white z-10 shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                    style={{ left: `${visualizer.entryPos}%` }}
                  />
                  <div 
                    className="absolute top-0 h-full w-1 bg-rose-500 z-10"
                    style={{ left: `${visualizer.slPos}%` }}
                  />
                  <div 
                    className="absolute top-0 h-full w-1 bg-emerald-500 z-10"
                    style={{ left: `${visualizer.tpPos}%` }}
                  />
                </div>
                <div className="flex justify-between text-[9px] font-mono text-zinc-500">
                  <span>SL</span>
                  <span>ENTRY</span>
                  <span>TP</span>
                </div>
              </div>
            )}

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
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Tags (comma separated)</label>
              <input
                type="text"
                placeholder="Breakout, High Volatility, FOMO..."
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Setup Description & Rationale</label>
                <button
                  type="button"
                  onClick={handleGetFeedback}
                  disabled={isAnalyzing || !formData.notes}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-2.5 py-1 text-[10px] font-bold text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-50 transition-all border border-indigo-500/20"
                >
                  {isAnalyzing ? <Loader2 size={10} className="animate-spin" /> : <Brain size={10} />}
                  Get AI Feedback
                </button>
              </div>
              <textarea
                rows={3}
                placeholder="Describe your entry reasons, indicators, news catalysts, and market context..."
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            <AnimatePresence>
              {aiFeedback && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 my-2">
                    <div className="flex items-center gap-2 mb-2 text-indigo-400">
                      <Sparkles size={14} />
                      <span className="text-xs font-bold uppercase tracking-wider">AI Coaching Feedback</span>
                      <button 
                        type="button"
                        onClick={() => setAiFeedback(null)}
                        className="ml-auto text-zinc-500 hover:text-zinc-400"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div className="markdown-body text-xs leading-relaxed text-zinc-300">
                      <Markdown>{aiFeedback}</Markdown>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 z-10 flex gap-3 border-t border-zinc-800 bg-zinc-900 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-zinc-800 py-3 text-sm font-medium hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            form="trade-form"
            type="submit"
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition-all active:scale-95"
          >
            {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-950 border-t-transparent" /> : <Save size={18} />}
            Save Trade
          </button>
        </div>
      </div>
    </div>
  );
}
