/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, signInWithGoogle, logout } from './firebase';
import { Layout, LineChart, BarChart, TrendingUp, History as HistoryIcon, BookOpen, Brain, LogOut, Plus, User as UserIcon, ChevronRight, AlertCircle, Target, Calendar as CalendarIcon, Menu, X } from 'lucide-react';
import { cn } from './lib/utils';
import Dashboard from './components/Dashboard';
import TradeForm from './components/TradeForm';
import TradeList from './components/TradeList';
import AIInsights from './components/AIInsights';
import Journal from './components/Journal';
import StrategyAnalysis from './components/StrategyAnalysis';
import Calendar from './components/Calendar';
import Settings from './components/Settings';
import NotificationManager from './components/NotificationManager';

type Tab = 'dashboard' | 'trades' | 'journal' | 'insights' | 'strategy' | 'calendar' | 'settings';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isTradeFormOpen, setIsTradeFormOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 px-4 text-zinc-100">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
            <TrendingUp size={32} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">AlphaTrade</h1>
        </div>
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 shadow-2xl backdrop-blur-xl">
          <h2 className="mb-2 text-xl font-semibold">Welcome back</h2>
          <p className="mb-8 text-zinc-400">Sign in to your trading journal to track performance and get AI insights.</p>
          <button
            onClick={signInWithGoogle}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-zinc-100 py-3 font-medium text-zinc-950 transition-all hover:bg-white active:scale-[0.98]"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="h-5 w-5" alt="Google" />
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Layout },
    { id: 'trades', label: 'Trades', icon: HistoryIcon },
    { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
    { id: 'strategy', label: 'Strategy Analysis', icon: Target },
    { id: 'journal', label: 'Journal', icon: BookOpen },
    { id: 'insights', label: 'AI Insights', icon: Brain },
    { id: 'settings', label: 'Settings', icon: UserIcon },
  ];

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-zinc-800 bg-zinc-900 transition-transform md:static md:flex md:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <TrendingUp size={20} />
            </div>
            <span className="text-lg font-bold tracking-tight">AlphaTrade</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden">
            <X size={20} className="text-zinc-400" />
          </button>
        </div>
        
        <nav className="flex-1 space-y-1 px-3 py-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as Tab);
                setIsSidebarOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                activeTab === tab.id 
                  ? "bg-emerald-500/10 text-emerald-500" 
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              )}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="border-t border-zinc-800 p-4">
          <div className="flex items-center gap-3 px-2 py-3">
            <img src={user.photoURL || ''} className="h-8 w-8 rounded-full border border-zinc-700" alt={user.displayName || ''} />
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium">{user.displayName}</p>
              <p className="truncate text-xs text-zinc-500">{user.email}</p>
            </div>
            <button onClick={logout} className="text-zinc-500 hover:text-zinc-100 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-zinc-800 bg-zinc-900/30 px-6 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden text-zinc-400 hover:text-zinc-100"
            >
              <Menu size={24} />
            </button>
            <h2 className="text-lg font-semibold capitalize">{activeTab}</h2>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsTradeFormOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 transition-all hover:bg-emerald-400 active:scale-95"
            >
              <Plus size={16} />
              New Trade
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl space-y-8">
            {activeTab === 'dashboard' && <Dashboard userId={user.uid} />}
            {activeTab === 'trades' && <TradeList userId={user.uid} />}
            {activeTab === 'calendar' && <Calendar userId={user.uid} />}
            {activeTab === 'strategy' && <StrategyAnalysis userId={user.uid} />}
            {activeTab === 'journal' && <Journal userId={user.uid} />}
            {activeTab === 'insights' && <AIInsights userId={user.uid} />}
            {activeTab === 'settings' && <Settings userId={user.uid} />}
          </div>
        </div>
      </main>

      {/* Trade Form Modal */}
      {isTradeFormOpen && (
        <TradeForm 
          userId={user.uid} 
          onClose={() => setIsTradeFormOpen(false)} 
        />
      )}
      <NotificationManager userId={user.uid} />
    </div>
  );
}

