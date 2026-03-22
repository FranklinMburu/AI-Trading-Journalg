import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Trade, Strategy } from '../types';
import { GoogleGenAI, Type } from "@google/genai";
import { generateContent, getCache, setCache, isCacheValid, AI_MODELS } from '../services/aiService';
import { CheckCircle, AlertTriangle, Brain, ShieldCheck, Info, RefreshCw, MessageSquare, Target, Globe } from 'lucide-react';
import { cn } from '../lib/utils';

export default function PreFlightChecklist({ userId }: { userId: string }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [tradeDesc, setTradeDesc] = useState('');
  const [selectedStrategyId, setSelectedStrategyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tradesQuery = query(
      collection(db, 'trades'),
      where('userId', '==', userId),
      where('status', '==', 'CLOSED'),
      orderBy('exitTime', 'desc'),
      limit(10)
    );

    const unsubscribeTrades = onSnapshot(tradesQuery, (snapshot) => {
      setTrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trade)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trades');
    });

    const strategiesQuery = query(collection(db, 'strategies'), where('userId', '==', userId));
    const unsubscribeStrategies = onSnapshot(strategiesQuery, (snapshot) => {
      setStrategies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Strategy)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'strategies');
    });

    return () => {
      unsubscribeTrades();
      unsubscribeStrategies();
    };
  }, [userId]);

  const analyzeTrade = async () => {
    if (!tradeDesc.trim()) return;

    const strategy = strategies.find(s => s.id === selectedStrategyId);
    const cacheKey = `preflight_${userId}_${selectedStrategyId}_${tradeDesc.substring(0, 50)}`;
    const cached = getCache(cacheKey);
    const contextHash = `${trades.length}_${tradeDesc}`;

    if (isCacheValid(cached, 1 * 60 * 60 * 1000, contextHash)) {
      setAnalysis(cached?.data);
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const prompt = `
        You are a professional trading coach. Analyze this trade setup before the trader takes it.
        
        Trader's Description: "${tradeDesc}"
        
        Selected Strategy: ${strategy ? `${strategy.name}: ${strategy.rules}` : 'None selected'}
        
        Recent Trade Performance:
        ${trades.map(t => `- ${t.symbol} ${t.direction}: ${t.pnl && t.pnl > 0 ? 'WIN' : 'LOSS'} (${t.notes || 'No notes'})`).join('\n')}
        
        Tasks:
        1. Check if the description aligns with the strategy rules.
        2. Identify any psychological biases (e.g., revenge trading, FOMO) based on recent losses.
        3. Use Google Search to check for any high-impact news for the currency pairs mentioned in the description.
        4. Provide a "Go/No-Go" recommendation with specific warnings.
        
        Return the response as a JSON object with:
        - recommendation: "GO" | "CAUTION" | "NO-GO"
        - strategyAlignment: string
        - newsWarnings: string[]
        - psychologicalWarnings: string[]
        - keyChecklist: { item: string, status: "PASS" | "FAIL" | "WARN" }[]
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
              recommendation: { type: Type.STRING, enum: ['GO', 'CAUTION', 'NO-GO'] },
              strategyAlignment: { type: Type.STRING },
              newsWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
              psychologicalWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
              keyChecklist: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    item: { type: Type.STRING },
                    status: { type: Type.STRING, enum: ['PASS', 'FAIL', 'WARN'] }
                  },
                  required: ['item', 'status']
                }
              }
            },
            required: ['recommendation', 'strategyAlignment', 'newsWarnings', 'psychologicalWarnings', 'keyChecklist']
          }
        },
      });

      const data = JSON.parse(response.text);
      setAnalysis(data);
      setCache(cacheKey, data, contextHash);
    } catch (err) {
      console.error('Error analyzing trade:', err);
      setError('Failed to analyze trade setup. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
          <ShieldCheck size={24} />
        </div>
        <div>
          <h3 className="text-xl font-bold">Pre-Flight Checklist</h3>
          <p className="text-sm text-zinc-400">AI-powered trade setup validation and bias detection</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Input Section */}
        <div className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
              <Target size={14} />
              Select Strategy
            </label>
            <select 
              value={selectedStrategyId}
              onChange={(e) => setSelectedStrategyId(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">No Strategy (General Analysis)</option>
              {strategies.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
              <MessageSquare size={14} />
              Trade Description
            </label>
            <textarea 
              value={tradeDesc}
              onChange={(e) => setTradeDesc(e.target.value)}
              placeholder="Describe your setup: 'Buying BTC/USD at 65k because of a 4H double bottom and RSI divergence...'"
              className="h-40 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>

          <button 
            onClick={analyzeTrade}
            disabled={loading || !tradeDesc.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 py-3 font-bold text-zinc-950 transition-all hover:bg-blue-400 disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                Analyzing Setup...
              </>
            ) : (
              <>
                <Brain size={18} />
                Analyze Trade Setup
              </>
            )}
          </button>
        </div>

        {/* Results Section */}
        <div className="space-y-6">
          {error && (
            <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-rose-500">
              <AlertTriangle size={20} />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {!analysis && !loading && (
            <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 p-12 text-zinc-500">
              <Brain size={48} className="mb-4 opacity-20" />
              <p className="text-center text-sm">Describe your trade setup to receive an AI-powered pre-flight analysis.</p>
            </div>
          )}

          {analysis && (
            <div className="space-y-6 animate-in slide-in-from-right duration-500">
              {/* Recommendation Header */}
              <div className={cn(
                "rounded-2xl border p-6 text-center",
                analysis.recommendation === 'GO' ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500" :
                analysis.recommendation === 'CAUTION' ? "border-orange-500/20 bg-orange-500/10 text-orange-500" :
                "border-rose-500/20 bg-rose-500/10 text-rose-500"
              )}>
                <p className="text-xs font-bold uppercase tracking-widest">AI Recommendation</p>
                <p className="mt-1 text-3xl font-black">{analysis.recommendation}</p>
              </div>

              {/* Warnings Grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <div className="mb-3 flex items-center gap-2 text-orange-500">
                    <Globe size={16} />
                    <h4 className="text-xs font-bold uppercase tracking-wider">News Warnings</h4>
                  </div>
                  <ul className="space-y-2">
                    {analysis.newsWarnings.map((w: string, i: number) => (
                      <li key={i} className="text-xs text-zinc-400 leading-relaxed">• {w}</li>
                    ))}
                    {analysis.newsWarnings.length === 0 && <li className="text-xs text-zinc-600 italic">No major news detected.</li>}
                  </ul>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <div className="mb-3 flex items-center gap-2 text-blue-500">
                    <Brain size={16} />
                    <h4 className="text-xs font-bold uppercase tracking-wider">Bias Detection</h4>
                  </div>
                  <ul className="space-y-2">
                    {analysis.psychologicalWarnings.map((w: string, i: number) => (
                      <li key={i} className="text-xs text-zinc-400 leading-relaxed">• {w}</li>
                    ))}
                    {analysis.psychologicalWarnings.length === 0 && <li className="text-xs text-zinc-600 italic">No psychological biases detected.</li>}
                  </ul>
                </div>
              </div>

              {/* Strategy Alignment */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Strategy Alignment</h4>
                <p className="text-sm text-zinc-300 leading-relaxed">{analysis.strategyAlignment}</p>
              </div>

              {/* Key Checklist */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-zinc-500">Key Checklist</h4>
                <div className="space-y-3">
                  {analysis.keyChecklist.map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-zinc-950 p-3">
                      <span className="text-xs text-zinc-300">{item.item}</span>
                      <span className={cn(
                        "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                        item.status === 'PASS' ? "bg-emerald-500/10 text-emerald-500" :
                        item.status === 'WARN' ? "bg-orange-500/10 text-orange-500" :
                        "bg-rose-500/10 text-rose-500"
                      )}>
                        {item.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info Card */}
      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
        <div className="flex gap-4">
          <div className="rounded-xl bg-blue-500/10 p-2 text-blue-500">
            <Info size={20} />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-blue-500 uppercase tracking-wider">Why use a Pre-Flight Checklist?</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Professional pilots and surgeons use checklists to prevent simple errors in high-stakes environments. 
              In trading, a checklist forces you to slow down, check your rules, and acknowledge market conditions 
              before clicking "Buy" or "Sell". This AI tool acts as your co-pilot, identifying risks you might have missed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
