/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, signInWithGoogle, logout } from './firebase';
import { Layout, TrendingUp, History as HistoryIcon, BookOpen, Brain, LogOut, Plus, User as UserIcon, ChevronRight, AlertCircle, Target, Calendar as CalendarIcon, Menu, X, Shield, Globe, LineChart as LineChartIcon, CheckCircle, Calculator, Database, Search, Command, Loader2, ArrowUp, Zap } from 'lucide-react';
import { cn } from './lib/utils';
import { db, handleFirestoreError, OperationType } from './firebase';
import { doc, getDoc, setDoc, updateDoc, collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { Trade, Strategy, JournalEntry, TradingAccount } from './types';
import AIChatWidget from './components/AIChatWidget';
import GlobalSearch from './components/GlobalSearch';
import NexusAuditor from './components/NexusAuditor';
const safeLazy = (importFn: () => Promise<any>) => {
  return lazy(async () => {
    try {
      return await importFn();
    } catch (error) {
      console.error('Lazy loading failed, retrying...', error);
      // Retry once after 1s
      return new Promise((resolve, reject) => {
        setTimeout(async () => {
          try {
            resolve(await importFn());
          } catch (err) {
            // If still failing, reload the page to get the latest bundle info
            console.error('Lazy loading failed twice. Reloading page...');
            window.location.reload();
          }
        }, 1000);
      });
    }
  }) as any;
};

// Re-enable lazy loading for secondary components to optimize initial load
const Dashboard = safeLazy(() => import('./components/Dashboard'));
const TradeForm = safeLazy(() => import('./components/TradeForm'));
const TradeList = safeLazy(() => import('./components/TradeList'));
const AIInsights = safeLazy(() => import('./components/AIInsights'));
const Journal = safeLazy(() => import('./components/Journal'));
const StrategyAnalysis = safeLazy(() => import('./components/StrategyAnalysis'));
const Calendar = safeLazy(() => import('./components/Calendar'));
const Settings = safeLazy(() => import('./components/Settings'));
const NotificationManager = safeLazy(() => import('./components/NotificationManager'));
const AdminDashboard = safeLazy(() => import('./components/AdminDashboard'));
const EconomicCalendar = safeLazy(() => import('./components/EconomicCalendar'));
const EquityForecaster = safeLazy(() => import('./components/EquityForecaster'));
const PreFlightChecklist = safeLazy(() => import('./components/PreFlightChecklist'));
const RiskCalculator = safeLazy(() => import('./components/RiskCalculator'));
const DataExplorer = safeLazy(() => import('./components/DataExplorer'));
const LandingPage = safeLazy(() => import('./components/LandingPage'));

type Tab = 'dashboard' | 'trades' | 'journal' | 'insights' | 'strategy' | 'calendar' | 'settings' | 'admin' | 'economic' | 'forecasting' | 'preflight' | 'risk' | 'explorer' | 'nexus';

// Loading fallback component
const TabLoading = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      <p className="text-sm text-zinc-500 font-medium">Loading content...</p>
    </div>
  </div>
);

import { useAccount } from './contexts/AccountContext';

export default function App() {
  const { user, isAdmin, isDemoMode, setIsDemoMode, activeAccount, selectedAccountId, setSelectedAccountId, accounts, isLoading } = useAccount();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isTradeFormOpen, setIsTradeFormOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [preSelectedTradeId, setPreSelectedTradeId] = useState<string | null>(null);

  // AI Global Context Heartbeat
  useEffect(() => {
    if (!user) return;
    const broadcastContext = () => {
      window.dispatchEvent(new CustomEvent('nexus-global-context', {
        detail: {
          source: 'System Navigation',
          data: `User is currently on the ${activeTab} tab. Account: ${selectedAccountId || 'All'}. Site status: Authenticated: ${user.email}.`
        }
      }));
    };
    
    broadcastContext();
  }, [activeTab, user, selectedAccountId]);

  const handleAccountChange = (accNo: string) => {
    setSelectedAccountId(accNo);
  };

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const tabs = React.useMemo(() => [
    { id: 'dashboard', label: 'Dashboard', icon: Layout },
    { id: 'trades', label: 'Trades', icon: HistoryIcon },
    { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
    { id: 'preflight', label: 'Pre-Flight', icon: CheckCircle },
    { id: 'risk', label: 'Risk Calculator', icon: Calculator },
    { id: 'strategy', label: 'Strategy Analysis', icon: Target },
    { id: 'journal', label: 'Journal', icon: BookOpen },
    { id: 'insights', label: 'AI Insights', icon: Brain },
    { id: 'nexus', label: 'Nexus AI Auditor', icon: Shield },
    { id: 'economic', label: 'Economic Calendar', icon: Globe },
    { id: 'forecasting', label: 'Equity Forecaster', icon: LineChartIcon },
    { id: 'explorer', label: 'Data Explorer', icon: Database },
    { id: 'settings', label: 'Settings', icon: UserIcon },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: Shield }] : []),
  ], [isAdmin]);

  // Pre-fetch background components for speed
  useEffect(() => {
    if (user) {
      // Trigger lazy loads in background
      const prefetch = () => {
        import('./components/TradeList');
        import('./components/Journal');
        import('./components/AIInsights');
        import('./components/StrategyAnalysis');
        import('./components/Settings');
      };
      // Delay prefetch slightly to prioritize initial dashboard render
      const timer = setTimeout(prefetch, 3000);
      return () => clearTimeout(timer);
    }
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LandingPage onSignIn={signInWithGoogle} />
        <AIChatWidget />
      </>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && !isSidebarCollapsed && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-zinc-800 bg-zinc-900 transition-all duration-300 ease-in-out will-change-[width,transform]",
          "md:static md:translate-x-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full",
          isSidebarOpen && !isSidebarCollapsed && "shadow-2xl",
          isSidebarHidden ? "w-0 border-none opacity-0 pointer-events-none" : (isSidebarCollapsed ? "w-20" : "w-64")
        )}
      >
        <div className={cn("flex h-16 items-center px-6", isSidebarCollapsed ? "justify-center px-0" : "justify-between")}>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <TrendingUp size={20} />
            </div>
            {!isSidebarCollapsed && <span className="text-lg font-bold tracking-tight">TradeFlow</span>}
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className={cn("md:hidden", isSidebarCollapsed && "hidden")}>
            <X size={20} className="text-zinc-400" />
          </button>
        </div>
        
        <nav className="flex-1 space-y-1 px-3 py-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as Tab);
                // Only close on mobile if we are in FULL mode (not mini)
                if (!isSidebarCollapsed) {
                  setIsSidebarOpen(false);
                }
              }}
              title={isSidebarCollapsed ? tab.label : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl transition-all",
                isSidebarCollapsed ? "justify-center px-0 py-3" : "px-3 py-2.5 text-sm font-medium",
                activeTab === tab.id 
                  ? "bg-emerald-500/10 text-emerald-500" 
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              )}
            >
              <tab.icon size={isSidebarCollapsed ? 22 : 18} />
              {!isSidebarCollapsed && tab.label}
            </button>
          ))}
        </nav>

    <div className="border-t border-zinc-800 p-4">
      <div className={cn("flex items-center gap-3 py-3", isSidebarCollapsed ? "flex-col px-0" : "px-2")}>
        <img src={user?.photoURL || ''} className="h-8 w-8 shrink-0 rounded-full border border-zinc-700" alt={user?.displayName || ''} />
        {!isSidebarCollapsed && (
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium">{user?.displayName}</p>
            <p className="truncate text-xs text-zinc-500">{user?.email}</p>
          </div>
        )}
        <button onClick={() => auth.signOut()} className="text-zinc-500 hover:text-zinc-100 transition-colors">
          <LogOut size={16} />
        </button>
      </div>
    </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "flex flex-1 flex-col overflow-hidden relative transition-all duration-300",
        isSidebarOpen && isSidebarCollapsed && !isSidebarHidden && "pl-20 md:pl-0"
      )}>
        {isSidebarHidden && (
          <button 
            onClick={() => {
              setIsSidebarHidden(false);
              setIsSidebarCollapsed(false);
              setIsSidebarOpen(true);
            }}
            className="fixed bottom-6 left-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20 transition-all hover:scale-110 active:scale-95 animate-in fade-in slide-in-from-left-4"
            title="Show Sidebar"
          >
            <Menu size={24} />
          </button>
        )}

        {showBackToTop && (
          <button 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-zinc-100 shadow-lg transition-all hover:bg-zinc-700 hover:scale-110 active:scale-95 animate-in fade-in slide-in-from-bottom-4"
            title="Back to Top"
          >
            <ArrowUp size={24} />
          </button>
        )}

        <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-4 md:px-6 backdrop-blur-xl z-30 sticky top-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                // If hidden, show full
                if (isSidebarHidden) {
                  setIsSidebarHidden(false);
                  setIsSidebarCollapsed(false);
                  setIsSidebarOpen(true);
                } 
                // If closed (mobile), open full
                else if (!isSidebarOpen) {
                  setIsSidebarOpen(true);
                  setIsSidebarCollapsed(false);
                }
                // If full, collapse to mini
                else if (!isSidebarCollapsed) {
                  setIsSidebarCollapsed(true);
                } 
                // If mini, hide
                else {
                  setIsSidebarHidden(true);
                  setIsSidebarOpen(false);
                }
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
              title={isSidebarHidden ? "Show Sidebar" : (isSidebarCollapsed ? "Hide Sidebar" : "Collapse Sidebar")}
            >
              <Menu size={20} />
            </button>
            <h2 className="text-lg font-bold capitalize tracking-tight">{activeTab}</h2>
          </div>
          <div className="flex items-center gap-2 md:gap-4 font-sans">
            {/* Account Selector */}
            {accounts.length > 0 && (
              <div className="relative flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 transition-all hover:border-zinc-700">
                <Database size={14} className="text-emerald-500" />
                <select 
                  value={selectedAccountId || ''} 
                  onChange={(e) => handleAccountChange(e.target.value)}
                  className="bg-transparent text-xs font-bold text-zinc-100 outline-none cursor-pointer"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.accountNumber} className="bg-zinc-900 text-zinc-100">
                      {acc.name} ({acc.currency})
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            <button 
              onClick={() => setIsDemoMode(!isDemoMode)}
              className={cn(
                "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all",
                isDemoMode 
                  ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" 
                  : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-zinc-100"
              )}
              title={isDemoMode ? "Switch to Real Mode" : "Switch to Demo Mode"}
            >
              <Zap size={14} className={cn(isDemoMode && "fill-amber-500")} />
              <span className="hidden lg:inline">{isDemoMode ? "DEMO MODE" : "REAL MODE"}</span>
            </button>
            <button 
              onClick={() => setIsSearchOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400 transition-all hover:border-zinc-700 hover:text-zinc-100 sm:h-auto sm:w-auto sm:px-3 sm:py-2 sm:text-sm"
            >
              <Search size={18} />
              <span className="hidden sm:ml-2 sm:inline">Search...</span>
              <div className="ml-2 hidden items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-bold text-zinc-500 lg:flex">
                <Command size={10} />
                <span>K</span>
              </div>
            </button>
            <button 
              onClick={() => setIsTradeFormOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-zinc-950 transition-all hover:bg-emerald-400 active:scale-95 sm:h-auto sm:w-auto sm:px-4 sm:py-2 sm:text-sm sm:font-medium"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">New Trade</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
          <div className="mx-auto max-w-6xl space-y-6 md:space-y-8">
            {isDemoMode && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex gap-3">
                  <Zap className="shrink-0 text-amber-500" size={20} />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-amber-500 uppercase tracking-wider">Demo Mode Active</p>
                    <p className="text-[11px] leading-relaxed text-zinc-400">
                      You are currently viewing sample data. This allows you to explore the platform's features without affecting your real trading journal. 
                      Switch back to <strong>Real Mode</strong> to manage your actual trades.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <Suspense fallback={<TabLoading />}>
              {activeTab === 'dashboard' && (
                <Dashboard 
                  onOpenTradeForm={() => setIsTradeFormOpen(true)} 
                />
              )}
              {activeTab === 'trades' && (
                <TradeList 
                  onJournalTrade={(id) => {
                    setPreSelectedTradeId(id);
                    setActiveTab('journal');
                  }}
                />
              )}
              {activeTab === 'calendar' && <Calendar />}
              {activeTab === 'strategy' && <StrategyAnalysis />}
              {activeTab === 'journal' && (
                <Journal 
                  initialTradeId={preSelectedTradeId || undefined}
                  onClearInitialTrade={() => setPreSelectedTradeId(null)}
                />
              )}
              {activeTab === 'insights' && <AIInsights />}
              {activeTab === 'preflight' && <PreFlightChecklist />}
              {activeTab === 'risk' && <RiskCalculator />}
              {activeTab === 'economic' && <EconomicCalendar />}
              {activeTab === 'forecasting' && <EquityForecaster />}
              {activeTab === 'explorer' && <DataExplorer isAdmin={isAdmin} />}
              {activeTab === 'nexus' && (
                <NexusAuditor 
                  onExecuteTrade={() => setIsTradeFormOpen(true)}
                />
              )}
              {activeTab === 'settings' && <Settings />}
              {activeTab === 'admin' && isAdmin && <AdminDashboard />}
            </Suspense>
          </div>
        </div>
      </main>

      {/* Trade Form Modal */}
      {isTradeFormOpen && (
        <TradeForm 
          onClose={() => setIsTradeFormOpen(false)} 
        />
      )}

      {isSearchOpen && (
        <GlobalSearch 
          onClose={() => setIsSearchOpen(false)} 
          onNavigate={(tab, id) => {
            setActiveTab(tab as Tab);
            if (id) {
              if (tab === 'trades' || tab === 'journal') {
                setPreSelectedTradeId(id);
              }
            }
          }}
        />
      )}
      <NotificationManager />
      <AIChatWidget />
    </div>
  );
}

