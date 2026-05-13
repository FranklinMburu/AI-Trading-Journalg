import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, where, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Database, Search, ChevronRight, ChevronDown, FileJson, RefreshCw, Download, Trash2, Copy, Check, Filter, Info, PlusCircle } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { addDoc } from 'firebase/firestore';

interface CollectionData {
  id: string;
  [key: string]: any;
}

import { useAccount } from '../contexts/AccountContext';

export default function DataExplorer() {
  const { activeAccount, selectedAccountId, isDemoMode, isAdmin } = useAccount();
  const userId = activeAccount?.userId;
  const accountId = selectedAccountId;

  const [activeCollection, setActiveCollection] = useState<'trades' | 'strategies' | 'settings' | 'users' | 'webhooks' | 'accounts'>('trades');
  const [data, setData] = useState<CollectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || (!accountId && !['users', 'accounts', 'webhooks'].includes(activeCollection))) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let q;
    
    if (activeCollection === 'users') {
      if (!isAdmin) {
        setLoading(false);
        return;
      }
      q = query(collection(db, 'users'));
    } else if (activeCollection === 'accounts') {
      q = query(collection(db, 'users', userId, 'accounts'), orderBy('lastUpdate', 'desc'));
    } else if (activeCollection === 'webhooks') {
      q = query(collection(db, 'users', userId, 'webhook_logs'), orderBy('timestamp', 'desc'), limit(50));
    } else {
      // Nested collections
      if (!accountId) {
        setLoading(false);
        return;
      }
      const baseCol = collection(db, 'users', userId, 'accounts', accountId, activeCollection);
      if (activeCollection === 'trades' || activeCollection === 'strategies') {
         q = query(baseCol, where('isDemo', '==', isDemoMode));
      } else {
        q = query(baseCol);
      }
    }
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setData(docs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, activeCollection);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [activeCollection, userId, accountId, isAdmin, isDemoMode]);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedDocs);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedDocs(newExpanded);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopyingId(id);
    setTimeout(() => setCopyingId(null), 2000);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this record? This action cannot be undone.')) return;
    if (!userId || !accountId) return;

    setDeletingId(id);
    try {
      if (activeCollection === 'users') {
        await deleteDoc(doc(db, 'users', id));
      } else {
        await deleteDoc(doc(db, 'users', userId, 'accounts', accountId, activeCollection, id));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${activeCollection}/${id}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeCollection}_export_${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSeed = async () => {
    if (activeCollection !== 'trades' || !userId || !accountId) return;
    
    try {
      await addDoc(collection(db, 'users', userId, 'accounts', accountId, 'trades'), {
        userId,
        symbol: 'XAUUSD',
        direction: 'LONG',
        type: 'MARKET',
        entryPrice: 2150.50,
        exitPrice: 2175.25,
        quantity: 0.1,
        pnl: 247.50,
        status: 'CLOSED',
        timestamp: new Date().toISOString(),
        notes: 'Sample trade for testing Data Explorer',
        strategyId: 'sample-strategy',
        isDemo: true
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'trades');
    }
  };

  const filteredData = data.filter(doc => 
    JSON.stringify(doc).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const collections = [
    { id: 'trades', label: 'Trades', count: activeCollection === 'trades' ? data.length : null },
    { id: 'strategies', label: 'Strategies', count: activeCollection === 'strategies' ? data.length : null },
    { id: 'settings', label: 'Settings', count: activeCollection === 'settings' ? data.length : null },
    { id: 'accounts', label: 'Accounts', count: activeCollection === 'accounts' ? data.length : null },
    { id: 'users', label: 'Users', count: activeCollection === 'users' ? data.length : null },
    { id: 'webhooks', label: 'Webhook Logs', count: activeCollection === 'webhooks' ? data.length : null },
  ].filter(col => col.id !== 'users' || isAdmin);

  const getDocSummary = (doc: any) => {
    switch (activeCollection) {
      case 'trades':
        return (
          <div className="flex items-center gap-3 text-[10px]">
            <span className={cn(
              "rounded px-1.5 py-0.5 font-bold",
              doc.direction === 'LONG' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
            )}>
              {doc.symbol} {doc.direction}
            </span>
            <span className="text-zinc-400">{doc.status}</span>
            {doc.pnl !== undefined && (
              <span className={cn("font-bold", doc.pnl >= 0 ? "text-emerald-500" : "text-rose-500")}>
                {formatCurrency(doc.pnl)}
              </span>
            )}
          </div>
        );
      case 'strategies':
        return <span className="text-zinc-300 font-medium">{doc.name}</span>;
      case 'users':
        return (
          <div className="flex items-center gap-2">
            <span className="text-zinc-300 font-medium">{doc.displayName || 'No Name'}</span>
            <span className="text-zinc-500">({doc.email})</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold uppercase text-zinc-400">{doc.role}</span>
          </div>
        );
      case 'settings':
        return <span className="text-zinc-400">Settings for {doc.userId}</span>;
      case 'accounts':
        return (
          <div className="flex items-center gap-2">
            <span className="text-zinc-300 font-medium">{doc.name || doc.accountNumber}</span>
            <span className="text-zinc-500">[{doc.currency}]</span>
            {doc.lastSync && <span className="text-[9px] text-emerald-500">Synced: {doc.lastSync}</span>}
          </div>
        );
      case 'webhooks':
        return (
          <div className="flex items-center gap-2">
            <span className="font-bold text-blue-500">{doc.time?.split('T')[1]?.split('.')[0]}</span>
            <span className="text-zinc-400">{doc.userParam}</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold text-zinc-400">{doc.queryId || 'no-query-id'}</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
            <Database size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold">System Data Explorer</h3>
            <p className="text-sm text-zinc-400">Inspect and manage raw database records</p>
          </div>
        </div>
        
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <input
              type="text"
              placeholder="Search raw data..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-64"
            />
          </div>
          
          <button
            onClick={handleExport}
            className="flex items-center justify-center gap-2 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-zinc-100 transition-all hover:bg-zinc-700 active:scale-95"
          >
            <Download size={18} />
            Export JSON
          </button>

          {activeCollection === 'trades' && (
            <button
              onClick={handleSeed}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-emerald-500 active:scale-95 shadow-lg shadow-emerald-600/20"
            >
              <PlusCircle size={18} />
              Seed Trade
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {collections.map((col) => (
          <button
            key={col.id}
            onClick={() => setActiveCollection(col.id as any)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all",
              activeCollection === col.id
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-100"
            )}
          >
            {col.label}
            {col.count !== null && (
              <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px]">
                {col.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-6 py-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            <Filter size={14} />
            {activeCollection} Collection
          </div>
          <div className="flex items-center gap-4 text-[10px] text-zinc-500">
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              Real-time Sync Active
            </div>
            <span>{filteredData.length} Records Found</span>
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm text-zinc-500">Loading collection data...</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-zinc-500">
            <FileJson size={48} className="opacity-20" />
            <p>No records found in this collection</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {filteredData.map((doc) => (
              <div key={doc.id} className="group">
                <div className="flex w-full items-center justify-between p-4 transition-colors hover:bg-zinc-800/30">
                  <button
                    onClick={() => toggleExpand(doc.id)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    {expandedDocs.has(doc.id) ? <ChevronDown size={18} className="text-blue-500" /> : <ChevronRight size={18} className="text-zinc-500" />}
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-[10px] text-blue-400/70">{doc.id}</span>
                      <div className="text-sm">
                        {getDocSummary(doc)}
                      </div>
                    </div>
                  </button>
                  
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => handleCopy(doc.id, doc.id)}
                      className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-blue-400"
                      title="Copy ID"
                    >
                      {copyingId === doc.id ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                    <button
                      onClick={() => handleCopy(JSON.stringify(doc, null, 2), `${doc.id}-json`)}
                      className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-emerald-400"
                      title="Copy JSON"
                    >
                      {copyingId === `${doc.id}-json` ? <Check size={16} className="text-emerald-500" /> : <FileJson size={16} />}
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={deletingId === doc.id}
                      className="rounded-lg p-2 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
                      title="Delete Record"
                    >
                      {deletingId === doc.id ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </div>
                </div>
                
                {expandedDocs.has(doc.id) && (
                  <div className="border-t border-zinc-800 bg-black/40 p-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="mb-2 flex items-center justify-between px-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">Raw Document Data</span>
                      <div className="flex items-center gap-2">
                        <Info size={12} className="text-zinc-500" />
                        <span className="text-[10px] text-zinc-500">Read-only view</span>
                      </div>
                    </div>
                    <pre className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-[11px] font-medium leading-relaxed text-emerald-400/90 shadow-inner">
                      {JSON.stringify(doc, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
        <div className="flex gap-3">
          <Info className="shrink-0 text-blue-500" size={20} />
          <div className="space-y-1">
            <p className="text-xs font-bold text-blue-500">Developer Tip</p>
            <p className="text-[11px] leading-relaxed text-zinc-400">
              Use the Data Explorer to verify that your trades and strategies are being correctly persisted to Firestore. 
              The search bar filters through all fields, including nested objects, making it easy to find specific records by any property.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
