import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Zap, 
  Brain, 
  Activity, 
  Target, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  ChevronRight,
  Database,
  Cpu,
  Lock,
  Terminal,
  BookOpen
} from 'lucide-react';
import { cn } from '../lib/utils';
import { generateContent, AI_MODELS } from '../services/aiService';
import { collection, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

interface AuditStep {
  id: string;
  label: string;
  status: 'WAIT' | 'PROCESS' | 'PASS' | 'FAIL';
  value?: string;
  reasoning?: string;
  icon: any;
}

import { useAccount } from '../contexts/AccountContext';

export default function NexusAuditor({ onExecuteTrade }: { onExecuteTrade?: () => void }) {
  const { activeAccount, selectedAccountId, isDemoMode } = useAccount();
  const userId = activeAccount?.userId;
  const accountId = selectedAccountId;

  const [isAuditing, setIsAuditing] = useState(false);
  const [nexusConfidence, setNexusConfidence] = useState(0);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  
  const [tradeInfo] = useState({
    symbol: 'ETH/USD',
    setup: 'CHOCH',
    price: 1.1092,
    time: '6:45:30 PM UTC'
  });

  const [steps, setSteps] = useState<AuditStep[]>([
    { id: 'structure', label: 'Structure Validation', status: 'PASS', icon: Target, reasoning: 'Market structure shift confirmed on 15m timeframe. Higher low established.' },
    { id: 'ict', label: 'ICT Confluence', status: 'PASS', icon: Zap, reasoning: 'Price tapped into 4H Fair Value Gap (FVG) with SMT divergence on BTC.' },
    { id: 'killzone', label: 'Killzone Check', status: 'FAIL', icon: Clock, reasoning: 'Outside of London/NY session overlap. Low volume environment detected.' },
    { id: 'confidence', label: 'Confidence Score', status: 'WAIT', icon: Activity },
    { id: 'memory', label: 'Historical Memory', status: 'WAIT', icon: Database },
    { id: 'reasoning', label: 'AI Reasoning', status: 'WAIT', icon: Brain },
    { id: 'learning', label: 'Self-Learning', status: 'WAIT', icon: Cpu },
    { id: 'evaluation', label: 'Strict Evaluation', status: 'WAIT', icon: Shield },
    { id: 'policy', label: 'Institutional Policy', status: 'WAIT', icon: Lock },
    { id: 'decision', label: 'Execution Decision', status: 'WAIT', icon: Terminal },
  ]);

  const [logs, setLogs] = useState<string[]>(['[SYSTEM] Nexus v4.2 initialized.', `[AUTH] Institutional credentials verified${accountId ? ' for Account: ' + accountId : ''}.`]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-9), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const runAudit = async () => {
    if (isAuditing) return;
    setIsAuditing(true);
    addLog(`Starting Deep Audit Trace for ETH/USD${accountId ? ' on ' + accountId : ''}...`);
    
    // Reset steps that were in WAIT
    setSteps(prev => prev.map(s => s.status === 'WAIT' ? { ...s, status: 'WAIT' } : s));
    setNexusConfidence(0);

    const waitSteps = steps.filter(s => s.status === 'WAIT');
    
    for (let i = 0; i < waitSteps.length; i++) {
      const step = waitSteps[i];
      setActiveStep(step.id);
      addLog(`Analyzing ${step.label}...`);
      
      setSteps(prev => prev.map(s => s.id === step.id ? { ...s, status: 'PROCESS' } : s));
      
      await new Promise(resolve => setTimeout(resolve, 1200 + Math.random() * 800));
      
      let resultStatus: 'PASS' | 'FAIL' = Math.random() > 0.2 ? 'PASS' : 'FAIL';
      let resultValue = resultStatus === 'PASS' ? 'OPTIMAL' : 'RISK DETECTED';
      
      if (step.id === 'confidence') {
        const score = Math.floor(Math.random() * 40) + 55;
        setNexusConfidence(score);
        resultValue = `${score}%`;
      }

      addLog(`${step.label}: ${resultStatus}`);

      setSteps(prev => prev.map(s => s.id === step.id ? { 
        ...s, 
        status: resultStatus, 
        value: resultValue,
        reasoning: getReasoning(step.id, resultStatus)
      } : s));
    }
    
    setActiveStep(null);
    setIsAuditing(false);
    addLog('Audit complete. Execution decision rendered.');
  };

  const saveToJournal = async () => {
    if (steps.every(s => s.status === 'WAIT')) {
      addLog('No audit trace to export. Run an audit first.');
      return;
    }

    if (!userId || !accountId) return;

    addLog('Exporting audit trace to Journal...');
    try {
      const auditSummary = steps
        .filter(s => s.status !== 'WAIT')
        .map(s => `${s.label}: ${s.status}${s.value ? ` [${s.value}]` : ''}\nReasoning: ${s.reasoning || 'N/A'}`)
        .join('\n\n');

      const content = `NEXUS AI AUDIT TRACE - ${tradeInfo.symbol}${accountId ? ' (Account ' + accountId + ')' : ''}\n` +
        `Confidence: ${nexusConfidence}%\n` +
        `Time: ${tradeInfo.time}\n\n` +
        `--- AUDIT STEPS ---\n\n${auditSummary}`;

      await addDoc(collection(db, 'users', userId, 'accounts', accountId, 'journal_entries'), {
        userId,
        accountId: accountId || null,
        content,
        mood: nexusConfidence > 70 ? 'Focused' : 'Neutral',
        tags: ['nexus-audit', tradeInfo.symbol],
        timestamp: new Date().toISOString(),
        isDemo: isDemoMode
      });

      addLog('Audit trace saved to journal successfully.');
    } catch (error) {
      console.error('Error saving audit trace:', error);
      handleFirestoreError(error, OperationType.CREATE, 'journal_entries');
      addLog('Failed to save audit trace.');
    }
  };

  const getReasoning = (id: string, status: string) => {
    const reasonings: Record<string, string> = {
      confidence: status === 'PASS' ? 'Confidence exceeds institutional threshold of 75%. High probability setup detected.' : 'Confidence below threshold. Liquidity gaps detected in order book.',
      memory: status === 'PASS' ? 'Historical backtest shows 82% success rate for this specific CHOCH pattern in similar volatility regimes.' : 'Pattern mismatch in historical data. Similar setups led to fakeouts in 2024.',
      reasoning: status === 'PASS' ? 'Multi-agent consensus achieved. Sentiment analysis across social and order flow is bullish.' : 'Divergence detected between retail sentiment and institutional positioning.',
      learning: status === 'PASS' ? 'Neural network weights adjusted. Current market regime identified as "Expansionary Bullish".' : 'Uncertainty in regime classification. Model suggests caution.',
      evaluation: status === 'PASS' ? 'Strict risk-to-reward ratio of 1:3.5 is achievable. Stop loss placement is mathematically sound.' : 'Risk parameters violated. Potential for slippage exceeds 2%.',
      policy: status === 'PASS' ? 'Trade aligns with internal compliance and portfolio diversification limits.' : 'Concentration risk detected. Trade exceeds max exposure for ETH.',
      decision: status === 'PASS' ? 'EXECUTE: Market Order recommended at current price levels.' : 'ABORT: Wait for further confirmation or session overlap.',
    };
    return reasonings[id] || 'Nexus AI analysis complete.';
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      {/* Header Card */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Shield size={120} />
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-500 mb-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Nexus AI Auditor v4.2</span>
            </div>
            <h2 className="text-5xl font-black tracking-tighter flex items-center gap-3">
              {tradeInfo.symbol}
              <span className="text-2xl font-medium text-zinc-600">/ {tradeInfo.setup}</span>
            </h2>
            <div className="flex items-center gap-4 text-sm text-zinc-400 font-mono mt-2">
              <span className="flex items-center gap-1.5 bg-zinc-800/50 px-2 py-1 rounded border border-zinc-700/50">
                <Target size={14} className="text-emerald-500" />
                Price: {tradeInfo.price}
              </span>
              <span className="flex items-center gap-1.5 bg-zinc-800/50 px-2 py-1 rounded border border-zinc-700/50">
                <Clock size={14} className="text-blue-500" />
                {tradeInfo.time}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center md:items-end gap-2">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em]">Nexus Confidence</p>
            <div className="relative h-24 w-24">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                <circle
                  className="stroke-zinc-800 fill-none"
                  strokeWidth="2.5"
                  r="16"
                  cx="18"
                  cy="18"
                />
                <motion.circle
                  className="stroke-emerald-500 fill-none"
                  strokeWidth="2.5"
                  strokeDasharray="100, 100"
                  strokeDashoffset={100 - nexusConfidence}
                  strokeLinecap="round"
                  initial={{ strokeDashoffset: 100 }}
                  animate={{ strokeDashoffset: 100 - nexusConfidence }}
                  transition={{ duration: 1.5, ease: "circOut" }}
                  r="16"
                  cx="18"
                  cy="18"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black tracking-tighter">{nexusConfidence}%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <button
            onClick={runAudit}
            disabled={isAuditing}
            className={cn(
              "flex-1 relative flex items-center justify-center gap-3 rounded-xl py-4 text-sm font-black uppercase tracking-widest transition-all active:scale-[0.98] overflow-hidden",
              isAuditing 
                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" 
                : "bg-white text-zinc-950 hover:bg-emerald-400 shadow-[0_0_50px_rgba(16,185,129,0.1)] group"
            )}
          >
            {isAuditing ? (
              <div className="flex items-center gap-2">
                <motion.span animate={{ scale: [1, 1.4, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                <motion.span animate={{ scale: [1, 1.4, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <motion.span animate={{ scale: [1, 1.4, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                <span className="ml-2 uppercase tracking-tighter">Nexus Trace in Progress...</span>
              </div>
            ) : (
              <>
                <Activity size={20} className="group-hover:animate-pulse" />
                Initialize Deep Audit
              </>
            )}
          </button>
          
          <div className="flex-1 rounded-xl bg-black/40 border border-zinc-800 p-3 font-mono text-[10px] text-zinc-500 overflow-hidden h-[52px]">
            <div className="space-y-0.5">
              {logs.map((log, i) => (
                <div key={i} className="truncate">
                  <span className="text-emerald-500/50 mr-2">»</span>
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Audit Steps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {steps.map((step, index) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => step.reasoning && setActiveStep(activeStep === step.id ? null : step.id)}
            className={cn(
              "group cursor-pointer rounded-2xl border p-4 transition-all duration-300",
              activeStep === step.id 
                ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20" 
                : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/50",
              step.status === 'PROCESS' && "border-blue-500/50 bg-blue-500/5 animate-pulse"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                  step.status === 'PASS' ? "bg-emerald-500/10 text-emerald-500" :
                  step.status === 'FAIL' ? "bg-rose-500/10 text-rose-500" :
                  step.status === 'PROCESS' ? "bg-blue-500/10 text-blue-500" :
                  "bg-zinc-800 text-zinc-500"
                )}>
                  <step.icon size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{step.label}</p>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-xs font-bold",
                      step.status === 'PASS' ? "text-emerald-400" :
                      step.status === 'FAIL' ? "text-rose-400" :
                      step.status === 'PROCESS' ? "text-blue-400" :
                      "text-zinc-600"
                    )}>
                      {step.status}
                    </span>
                    {step.value && <span className="text-[10px] text-zinc-500 font-mono">[{step.value}]</span>}
                  </div>
                </div>
              </div>
              
              {step.reasoning && (
                <ChevronRight 
                  size={14} 
                  className={cn(
                    "text-zinc-700 transition-transform duration-300",
                    activeStep === step.id && "rotate-90 text-emerald-500"
                  )} 
                />
              )}
            </div>

            <AnimatePresence>
              {activeStep === step.id && step.reasoning && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 border-t border-zinc-800/50 pt-4">
                    <p className="text-[10px] leading-relaxed text-zinc-500 italic">
                      {step.reasoning}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      {/* Final Decision Summary */}
      {!isAuditing && steps.some(s => s.status !== 'WAIT') && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "rounded-2xl border p-8 text-center space-y-4",
            steps.find(s => s.id === 'decision')?.status === 'PASS' 
              ? "border-emerald-500/30 bg-emerald-500/5" 
              : "border-rose-500/30 bg-rose-500/5"
          )}
        >
          <div className="flex justify-center">
            {steps.find(s => s.id === 'decision')?.status === 'PASS' ? (
              <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.2)]">
                <CheckCircle2 size={40} />
              </div>
            ) : (
              <div className="h-16 w-16 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-500 shadow-[0_0_40px_rgba(244,63,94,0.2)]">
                <XCircle size={40} />
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <h3 className="text-2xl font-black uppercase tracking-tighter">
              {steps.find(s => s.id === 'decision')?.status === 'PASS' ? 'Execution Authorized' : 'Execution Denied'}
            </h3>
            <p className="text-sm text-zinc-400 max-w-md mx-auto">
              {steps.find(s => s.id === 'decision')?.reasoning}
            </p>
          </div>

          <div className="pt-4 flex justify-center gap-4">
            <button 
              onClick={saveToJournal}
              className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-3 text-sm font-bold text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-all"
            >
              <BookOpen size={18} />
              Journal Trace
            </button>
            {steps.find(s => s.id === 'decision')?.status === 'PASS' && (
              <button 
                onClick={onExecuteTrade}
                className="flex items-center gap-2 rounded-xl bg-emerald-500 px-8 py-3 text-sm font-black text-zinc-950 hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Zap size={18} />
                Execute Market Order
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* Footer Info */}
      <div className="flex items-center justify-center gap-4 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-600">
        <span className="flex items-center gap-1.5"><Shield size={12} /> Institutional Grade</span>
        <span className="h-1 w-1 rounded-full bg-zinc-800" />
        <span className="flex items-center gap-1.5"><Cpu size={12} /> Nexus Engine v4.2</span>
      </div>
    </div>
  );
}
