import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { JournalEntry, Trade } from '../types';
import { BookOpen, Plus, Calendar, Smile, Tag, Save, X, Link as LinkIcon, TrendingUp, TrendingDown, Edit2, Trash2, ExternalLink, Info } from 'lucide-react';
import { format } from 'date-fns';
import { cn, formatCurrency } from '../lib/utils';

import { useAccount } from '../contexts/AccountContext';

export default function Journal({ initialTradeId, onClearInitialTrade }: { initialTradeId?: string, onClearInitialTrade?: () => void }) {
  const { activeAccount, selectedAccountId, isDemoMode } = useAccount();
  const userId = activeAccount?.userId;
  const accountId = selectedAccountId;

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [newContent, setNewContent] = useState('');
  const [mood, setMood] = useState('Neutral');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [selectedTradeId, setSelectedTradeId] = useState<string>('');
  const [viewingTrade, setViewingTrade] = useState<Trade | null>(null);

  useEffect(() => {
    if (initialTradeId) {
      setSelectedTradeId(initialTradeId);
      setIsAdding(true);
      if (onClearInitialTrade) onClearInitialTrade();
    }
  }, [initialTradeId]);

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  useEffect(() => {
    if (!userId || !accountId) return;

    const q = query(
      collection(db, 'users', userId, 'accounts', accountId, 'journal_entries'),
      where('isDemo', '==', isDemoMode),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JournalEntry)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'journal_entries');
    });

    const tradesQuery = query(
      collection(db, 'users', userId, 'accounts', accountId, 'trades'),
      where('isDemo', '==', isDemoMode),
      orderBy('entryTime', 'desc')
    );

    const unsubscribeTrades = onSnapshot(tradesQuery, (snapshot) => {
      setTrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trade)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trades');
    });

    return () => {
      unsubscribe();
      unsubscribeTrades();
    };
  }, [userId, accountId, isDemoMode]);

  const handleSave = async () => {
    if (!newContent.trim() || !userId || !accountId) return;
    try {
      const entryData = {
        userId,
        accountId,
        content: newContent,
        mood,
        tags,
        tradeId: selectedTradeId || null,
        timestamp: editingEntry ? editingEntry.timestamp : new Date().toISOString(),
        isDemo: isDemoMode
      };

      if (editingEntry?.id) {
        await updateDoc(doc(db, 'users', userId, 'accounts', accountId, 'journal_entries', editingEntry.id), entryData);
      } else {
        await addDoc(collection(db, 'users', userId, 'accounts', accountId, 'journal_entries'), entryData);
      }

      resetForm();
    } catch (error) {
      handleFirestoreError(error, editingEntry?.id ? OperationType.UPDATE : OperationType.CREATE, 'journal_entries');
    }
  };

  const resetForm = () => {
    setNewContent('');
    setTags([]);
    setMood('Neutral');
    setSelectedTradeId('');
    setIsAdding(false);
    setEditingEntry(null);
  };

  const handleEdit = (entry: JournalEntry) => {
    setEditingEntry(entry);
    setNewContent(entry.content);
    setMood(entry.mood || 'Neutral');
    setTags(entry.tags || []);
    setSelectedTradeId(entry.tradeId || '');
    setIsAdding(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this entry?') || !userId || !accountId) return;
    try {
      await deleteDoc(doc(db, 'users', userId, 'accounts', accountId, 'journal_entries', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'journal_entries');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">Trading Journal</h3>
        <button 
          onClick={() => {
            if (isAdding) resetForm();
            else setIsAdding(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
        >
          {isAdding ? <X size={16} /> : <Plus size={16} />}
          {isAdding ? 'Cancel' : 'New Entry'}
        </button>
      </div>

      {isAdding && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
          <h4 className="mb-6 text-lg font-semibold text-zinc-100">
            {editingEntry ? 'Edit Journal Entry' : 'New Journal Entry'}
          </h4>
          <div className="mb-6 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1 space-y-3">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Mood</span>
              <div className="flex flex-wrap gap-2">
                {['Happy', 'Neutral', 'Stressed', 'Focused', 'Greedy', 'FOMO'].map(m => (
                  <button
                    key={m}
                    onClick={() => setMood(m)}
                    className={cn(
                      "rounded-xl px-4 py-2 text-xs font-bold transition-all active:scale-95",
                      mood === m ? "bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 space-y-3">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Link Trade</span>
              <select
                value={selectedTradeId}
                onChange={(e) => setSelectedTradeId(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">No trade linked</option>
                {trades.map(trade => (
                  <option key={trade.id} value={trade.id}>
                    {trade.symbol} - {trade.direction} ({format(new Date(trade.entryTime), 'MMM d, HH:mm')})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-4 flex items-center gap-2">
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                <input
                  type="text"
                  placeholder="Add tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag()}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-1.5 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <button 
                onClick={addTag}
                className="rounded-lg border border-zinc-800 bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
              >
                Add
              </button>
            </div>

            {tags.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-500">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-emerald-400">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            autoFocus
            rows={5}
            placeholder="How was your trading day? What did you learn?"
            className="mb-4 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <button onClick={resetForm} className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-100">Cancel</button>
            <button 
              onClick={handleSave}
              className="flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
            >
              <Save size={16} />
              {editingEntry ? 'Update Entry' : 'Save Entry'}
            </button>
          </div>
        </div>
      )}

    <div className="space-y-4">
        {entries.map((entry) => {
          const linkedTrade = trades.find(t => t.id === entry.tradeId);
          
          return (
            <div key={entry.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {format(new Date(entry.timestamp), 'MMMM d, yyyy')}
                  </span>
                  {entry.mood && (
                    <span className="flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-400">
                      <Smile size={12} />
                      {entry.mood}
                    </span>
                  )}
                </div>
                
                {linkedTrade && (
                  <button 
                    onClick={() => setViewingTrade(linkedTrade)}
                    className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-1.5 border border-zinc-800 hover:bg-zinc-800 transition-colors group"
                  >
                    <LinkIcon size={12} className="text-emerald-500 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-zinc-300">{linkedTrade.symbol}</span>
                    <span className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded",
                      linkedTrade.direction === 'LONG' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                    )}>
                      {linkedTrade.direction}
                    </span>
                    {linkedTrade.pnl !== undefined && (
                      <span className={cn(
                        "text-xs font-mono",
                        linkedTrade.pnl >= 0 ? "text-emerald-500" : "text-rose-500"
                      )}>
                        {linkedTrade.pnl >= 0 ? '+' : ''}{formatCurrency(linkedTrade.pnl)}
                      </span>
                    )}
                    <Info size={12} className="text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleEdit(entry)}
                    className="p-2 text-zinc-500 hover:text-emerald-500 transition-colors"
                    title="Edit entry"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    onClick={() => entry.id && handleDelete(entry.id)}
                    className="p-2 text-zinc-500 hover:text-rose-500 transition-colors"
                    title="Delete entry"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{entry.content}</p>
            </div>
          );
        })}

        {entries.length === 0 && !isAdding && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <BookOpen size={48} className="mb-4 opacity-20" />
            <p className="mb-2">Your journal is empty. Start writing about your trading journey.</p>
            <p className="text-sm opacity-60">Tip: You can link specific trades to your entries from the Trade History tab.</p>
          </div>
        )}
      </div>

      {/* Trade Detail Modal */}
      {viewingTrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="my-auto w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-lg",
                  viewingTrade.direction === 'LONG' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                )}>
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h4 className="text-lg font-bold">{viewingTrade.symbol}</h4>
                  <p className="text-xs text-zinc-500">{format(new Date(viewingTrade.entryTime), 'MMMM d, yyyy HH:mm')}</p>
                </div>
              </div>
              <button onClick={() => setViewingTrade(null)} className="text-zinc-500 hover:text-zinc-100">
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="rounded-xl bg-zinc-950 p-3 border border-zinc-800">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Entry Price</p>
                <p className="text-sm font-mono font-medium">{formatCurrency(viewingTrade.entryPrice)}</p>
              </div>
              <div className="rounded-xl bg-zinc-950 p-3 border border-zinc-800">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Exit Price</p>
                <p className="text-sm font-mono font-medium">{viewingTrade.exitPrice ? formatCurrency(viewingTrade.exitPrice) : 'N/A'}</p>
              </div>
              <div className="rounded-xl bg-zinc-950 p-3 border border-zinc-800">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Quantity</p>
                <p className="text-sm font-mono font-medium">{viewingTrade.quantity}</p>
              </div>
              <div className="rounded-xl bg-zinc-950 p-3 border border-zinc-800">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">PnL</p>
                <p className={cn(
                  "text-sm font-mono font-bold",
                  (viewingTrade.pnl || 0) >= 0 ? "text-emerald-500" : "text-rose-500"
                )}>
                  {(viewingTrade.pnl || 0) >= 0 ? '+' : ''}{formatCurrency(viewingTrade.pnl || 0)}
                </p>
              </div>
            </div>

            {viewingTrade.notes && (
              <div className="mb-6">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Trade Notes</p>
                <div className="rounded-xl bg-zinc-950 p-3 border border-zinc-800 text-xs text-zinc-400 leading-relaxed">
                  {viewingTrade.notes}
                </div>
              </div>
            )}

            <button 
              onClick={() => setViewingTrade(null)}
              className="w-full rounded-xl bg-zinc-800 py-3 text-sm font-medium hover:bg-zinc-700 transition-colors"
            >
              Close Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
