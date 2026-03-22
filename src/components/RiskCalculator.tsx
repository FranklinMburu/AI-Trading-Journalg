import React, { useState, useEffect } from 'react';
import { Calculator, DollarSign, Percent, Target, Shield, Info } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';

interface RiskCalculatorProps {
  userId: string;
  initialBalance?: number;
  onCalculate?: (positionSize: number) => void;
  compact?: boolean;
  entryPrice?: number;
  stopLossPrice?: number;
}

export default function RiskCalculator({ userId, initialBalance, onCalculate, compact, entryPrice, stopLossPrice }: RiskCalculatorProps) {
  const [balance, setBalance] = useState(initialBalance || 10000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [stopLossPips, setStopLossPips] = useState(20);
  const [pipValue, setPipValue] = useState(10); // Default for 1 lot on standard pairs
  const [calculationMode, setCalculationMode] = useState<'pips' | 'price'>(entryPrice && stopLossPrice ? 'price' : 'pips');
  const [positionSize, setPositionSize] = useState(0);
  const [riskAmount, setRiskAmount] = useState(0);

  useEffect(() => {
    const riskAmt = (balance * riskPercent) / 100;
    setRiskAmount(riskAmt);
    
    let effectiveSL = stopLossPips;
    
    if (calculationMode === 'price' && entryPrice && stopLossPrice) {
      effectiveSL = Math.abs(entryPrice - stopLossPrice);
      // For price-based, we assume pipValue is 1 (direct dollar per unit)
      const size = riskAmt / effectiveSL;
      setPositionSize(Number(size.toFixed(2)));
      if (onCalculate) onCalculate(Number(size.toFixed(2)));
    } else if (stopLossPips > 0 && pipValue > 0) {
      const size = riskAmt / (stopLossPips * pipValue);
      setPositionSize(Number(size.toFixed(2)));
      if (onCalculate) onCalculate(Number(size.toFixed(2)));
    }
  }, [balance, riskPercent, stopLossPips, pipValue, calculationMode, entryPrice, stopLossPrice]);

  return (
    <div className={cn("space-y-6 animate-in fade-in duration-500", compact && "space-y-4")}>
      {!compact && (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
            <Calculator size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold">Risk & Position Sizer</h3>
            <p className="text-sm text-zinc-400">Calculate your ideal lot size to protect your capital</p>
          </div>
        </div>
      )}

      <div className={cn("grid grid-cols-1 gap-6", !compact && "lg:grid-cols-2", compact && "gap-4")}>
        <div className={cn("space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6", compact && "p-0 border-0 bg-transparent")}>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setCalculationMode('pips')}
              className={cn(
                "flex-1 rounded-lg py-1 text-[10px] font-bold transition-all",
                calculationMode === 'pips' ? "bg-zinc-100 text-zinc-950" : "bg-zinc-800 text-zinc-400"
              )}
            >
              Pips Mode
            </button>
            <button
              type="button"
              onClick={() => setCalculationMode('price')}
              className={cn(
                "flex-1 rounded-lg py-1 text-[10px] font-bold transition-all",
                calculationMode === 'price' ? "bg-zinc-100 text-zinc-950" : "bg-zinc-800 text-zinc-400"
              )}
            >
              Price Mode
            </button>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              <DollarSign size={12} />
              Account Balance
            </label>
            <input 
              type="number" 
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value))}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              <Percent size={12} />
              Risk Percentage
            </label>
            <div className="flex gap-2">
              {[0.5, 1, 2].map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setRiskPercent(p)}
                  className={cn(
                    "flex-1 rounded-lg py-1.5 text-[10px] font-bold transition-all",
                    riskPercent === p ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  )}
                >
                  {p}%
                </button>
              ))}
              <input 
                type="number" 
                value={riskPercent}
                onChange={(e) => setRiskPercent(Number(e.target.value))}
                className="w-16 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-center text-[10px] focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {calculationMode === 'pips' ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  <Target size={12} />
                  Stop Loss (Pips)
                </label>
                <input 
                  type="number" 
                  value={stopLossPips}
                  onChange={(e) => setStopLossPips(Number(e.target.value))}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  <Info size={12} />
                  Pip Value ($)
                </label>
                <input 
                  type="number" 
                  value={pipValue}
                  onChange={(e) => setPipValue(Number(e.target.value))}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 space-y-2">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                <span>Entry: {entryPrice || 'N/A'}</span>
                <span>SL: {stopLossPrice || 'N/A'}</span>
              </div>
              <div className="text-xs text-zinc-400">
                Distance: <span className="text-zinc-100 font-mono">{entryPrice && stopLossPrice ? Math.abs(entryPrice - stopLossPrice).toFixed(4) : '0.00'}</span>
              </div>
            </div>
          )}
        </div>

        <div className={cn(
          "flex flex-col justify-between rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8",
          compact && "p-4 border-emerald-500/10"
        )}>
          <div className={cn("space-y-6", compact && "space-y-2")}>
            <div>
              <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Risk Amount</p>
              <p className={cn("font-bold text-rose-500", compact ? "text-xl" : "text-4xl")}>{formatCurrency(riskAmount)}</p>
            </div>

            <div className="h-px bg-zinc-800/50" />

            <div>
              <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Recommended Size</p>
              <div className="flex items-baseline gap-2">
                <p className={cn("font-black text-emerald-500", compact ? "text-3xl" : "text-5xl")}>{positionSize}</p>
                <p className={cn("font-bold text-emerald-500/50 uppercase", compact ? "text-xs" : "text-xl")}>{calculationMode === 'pips' ? 'Lots' : 'Units'}</p>
              </div>
            </div>
          </div>

          {!compact && (
            <div className="mt-8 flex items-center gap-3 rounded-xl bg-zinc-900/50 p-4 border border-zinc-800">
              <Shield className="text-emerald-500" size={20} />
              <p className="text-xs text-zinc-400 leading-relaxed">
                Using a fixed risk percentage ensures that no single trade can significantly damage your account. 
                This is the foundation of professional trading.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
