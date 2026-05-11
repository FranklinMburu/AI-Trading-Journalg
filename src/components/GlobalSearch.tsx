import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Trade, Strategy, JournalEntry } from '../types';
import { Search, X, History, Target, BookOpen, ArrowRight, Loader2, Command } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';

import { useAccount } from '../contexts/AccountContext';

interface GlobalSearchProps {
  onClose: () => void;
  onNavigate: (tab: string, id?: string) => void;
}

interface SearchResult {
  id: string;
  type: 'trade' | 'strategy' | 'journal';
  title: string;
  subtitle: string;
  timestamp: string;
  data: any;
}

export default function GlobalSearch({ onClose, onNavigate }: GlobalSearchProps) {
  const { activeAccount, selectedAccountId, isDemoMode } = useAccount();
  const userId = activeAccount?.userId;
  const accountId = selectedAccountId;

  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
      }
      if (e.key === 'Enter' && selectedIndex >= 0) {
        handleSelect(results[selectedIndex]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, results, selectedIndex]);

  useEffect(() => {
    setSelectedIndex(-1);
  }, [searchTerm]);

  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  useEffect(() => {
    const performSearch = async () => {
      if (searchTerm.length < 2 || !userId || !accountId) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const searchLower = searchTerm.toLowerCase();
        
        // 1. Search Trades (by symbol)
        const tradesQuery = query(
          collection(db, 'users', userId, 'accounts', accountId, 'trades'),
          where('isDemo', '==', isDemoMode),
          limit(50)
        );
        const tradesSnap = await getDocs(tradesQuery);
        const tradeResults: SearchResult[] = tradesSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Trade))
          .filter(t => t.symbol.toLowerCase().includes(searchLower) || (t.notes?.toLowerCase().includes(searchLower)))
          .map(t => ({
            id: t.id!,
            type: 'trade',
            title: `${t.symbol} ${t.direction}`,
            subtitle: `${t.status} • ${t.pnl ? formatCurrency(t.pnl) : 'Open'} • ${t.notes?.substring(0, 40) || 'No notes'}`,
            timestamp: t.entryTime,
            data: t
          }));

        // 2. Search Strategies (by name)
        const strategiesQuery = query(
          collection(db, 'users', userId, 'accounts', accountId, 'strategies'),
          where('isDemo', '==', isDemoMode),
          limit(20)
        );
        const strategiesSnap = await getDocs(strategiesQuery);
        const strategyResults: SearchResult[] = strategiesSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Strategy))
          .filter(s => s.name.toLowerCase().includes(searchLower) || s.rules?.toLowerCase().includes(searchLower))
          .map(s => ({
            id: s.id!,
            type: 'strategy',
            title: s.name,
            subtitle: s.rules?.substring(0, 60) || 'No rules defined',
            timestamp: s.createdAt || '',
            data: s
          }));

        // 3. Search Journal Entries (by content)
        const journalQuery = query(
          collection(db, 'users', userId, 'accounts', accountId, 'journal_entries'),
          where('isDemo', '==', isDemoMode),
          limit(50)
        );
        const journalSnap = await getDocs(journalQuery);
        const journalResults: SearchResult[] = journalSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as JournalEntry))
          .filter(j => j.content.toLowerCase().includes(searchLower))
          .map(j => ({
            id: j.id!,
            type: 'journal',
            title: 'Journal Entry',
            subtitle: j.content.substring(0, 80) + '...',
            timestamp: j.timestamp,
            data: j
          }));

        const allResults = [...tradeResults, ...strategyResults, ...journalResults]
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        
        setResults(allResults);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'multiple_collections');
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(performSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, userId, accountId, isDemoMode]);

  const handleSelect = (result: SearchResult) => {
    if (result.type === 'trade') {
      onNavigate('trades', result.id);
    } else if (result.type === 'strategy') {
      onNavigate('strategy', result.id);
    } else if (result.type === 'journal') {
      onNavigate('journal', result.id);
    }
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-start justify-center bg-zinc-950/80 p-4 pt-[10vh] backdrop-blur-sm sm:p-6 sm:pt-[15vh]"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="relative flex items-center border-b border-zinc-800 px-4 py-4">
          <Search className="mr-3 text-zinc-500" size={20} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search trades, strategies, or journal entries..."
            className="flex-1 bg-transparent text-lg text-zinc-100 placeholder-zinc-500 focus:outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="flex items-center gap-2">
            {loading ? (
              <Loader2 className="animate-spin text-zinc-500" size={20} />
            ) : searchTerm ? (
              <button 
                onClick={() => setSearchTerm('')} 
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
                title="Clear search"
              >
                <X size={20} />
              </button>
            ) : (
              <div className="hidden items-center gap-1 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-[10px] font-bold text-zinc-500 sm:flex">
                <Command size={10} />
                <span>K</span>
              </div>
            )}
            <div className="h-6 w-px bg-zinc-800 mx-1" />
            <button 
              onClick={onClose}
              className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
              title="Close search"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Results Area */}
        <div 
          ref={resultsRef}
          className="max-h-[60vh] overflow-y-auto p-2 scroll-smooth"
        >
          {!searchTerm && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-zinc-500">
                <Search size={32} />
              </div>
              <p className="text-sm font-medium text-zinc-400">Start typing to search your trading data</p>
              <p className="mt-1 text-xs text-zinc-500">Search by symbol, strategy name, or journal content</p>
            </div>
          )}

          {searchTerm && results.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm font-medium text-zinc-400">No results found for "{searchTerm}"</p>
              <p className="mt-1 text-xs text-zinc-500">Try a different keyword or check your spelling</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-1">
              {results.map((result, index) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    "group flex w-full items-center gap-4 rounded-xl p-3 text-left transition-all",
                    selectedIndex === index ? "bg-zinc-800 ring-1 ring-zinc-700" : "hover:bg-zinc-800/50"
                  )}
                >
                  <div className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-sm",
                    result.type === 'trade' && "bg-emerald-500/10 text-emerald-500",
                    result.type === 'strategy' && "bg-blue-500/10 text-blue-500",
                    result.type === 'journal' && "bg-purple-500/10 text-purple-500"
                  )}>
                    {result.type === 'trade' && <History size={20} />}
                    {result.type === 'strategy' && <Target size={20} />}
                    {result.type === 'journal' && <BookOpen size={20} />}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-zinc-100">{result.title}</p>
                      <span className="text-[10px] font-medium text-zinc-500">
                        {new Date(result.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="truncate text-xs text-zinc-400">{result.subtitle}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden text-[10px] font-bold uppercase tracking-widest text-zinc-600 group-hover:inline">View</span>
                    <ArrowRight className="shrink-0 text-zinc-700 transition-transform group-hover:translate-x-1 group-hover:text-zinc-400" size={16} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-950/50 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-4 sm:flex">
              <span className="flex items-center gap-1">
                <span className="rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5">ESC</span>
                to close
              </span>
              <span className="flex items-center gap-1">
                <span className="rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5">ENTER</span>
                to select
              </span>
            </div>
            
            {/* Mobile/Touch Navigation Buttons */}
            {results.length > 0 && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev))}
                  disabled={selectedIndex <= 0}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-30"
                >
                  <ArrowRight className="-rotate-90" size={14} />
                </button>
                <button 
                  onClick={() => setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev))}
                  disabled={selectedIndex >= results.length - 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-30"
                >
                  <ArrowRight className="rotate-90" size={14} />
                </button>
                <button 
                  onClick={() => selectedIndex >= 0 && handleSelect(results[selectedIndex])}
                  disabled={selectedIndex < 0}
                  className="flex h-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-30"
                >
                  Select
                </button>
              </div>
            )}
          </div>
          {results.length > 0 && (
            <span className="hidden sm:inline">{results.length} results found</span>
          )}
          <button 
            onClick={onClose}
            className="rounded-lg bg-zinc-800 px-4 py-1.5 text-xs font-bold text-zinc-100 transition-all hover:bg-zinc-700 active:scale-95 sm:hidden"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
