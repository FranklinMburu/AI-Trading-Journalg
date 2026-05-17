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
import Lenis from 'lenis';
import { db, handleFirestoreError, OperationType } from './firebase';
import { doc, getDoc, setDoc, updateDoc, collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { Trade, Strategy, JournalEntry, TradingAccount } from './types';
import AIChatWidget from './components/AIChatWidget';
import GlobalSearch from './components/GlobalSearch';
import NexusAuditor from './components/NexusAuditor';
import Dropdown from './components/Dropdown';
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
  const { user, isAdmin, isDemoMode, setIsDemoMode, activeAccount, selectedAccountId, setSelectedAccountId, accounts, accountsWithTrades, isLoading } = useAccount();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isTradeFormOpen, setIsTradeFormOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [preSelectedTradeId, setPreSelectedTradeId] = useState<string | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Global scroll effects
  useEffect(() => {
    // Only enable smooth scroll for landing page (when not logged in)
    // The main app uses native scroll to avoid trackpad/touch issues
    let lenis: Lenis | null = null;
    
    if (!user) {
      lenis = new Lenis({
        lerp: 0.22, 
        wheelMultiplier: 1.0,
        touchMultiplier: 2.0,
        infinite: false,
        autoResize: true,
      });

      function raf(time: number) {
        lenis?.raf(time);
        requestAnimationFrame(raf);
      }

      requestAnimationFrame(raf);
      (window as any).lenis = lenis;
    }

    const handleScroll = () => {
      const scrollPos = user 
        ? (scrollContainerRef.current?.scrollTop || 0) 
        : window.scrollY;
      setShowBackToTop(scrollPos > 400);
    };
    
    if (user) {
      const container = scrollContainerRef.current;
      if (container) {
        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
          container.removeEventListener('scroll', handleScroll);
          if (lenis) {
            lenis.destroy();
            (window as any).lenis = undefined;
          }
        };
      }
    } else {
      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        window.removeEventListener('scroll', handleScroll);
        if (lenis) {
          lenis.destroy();
          (window as any).lenis = undefined;
        }
      };
    }
  }, [user]);

  const lastBroadcastRef = React.useRef<string | null>(null);

  // AI Global Context Heartbeat
  useEffect(() => {
    if (!user) return;
    const broadcastContext = () => {
      let data = `User is currently on the ${activeTab} tab. Account: ${selectedAccountId || 'All'}. Site status: Authenticated: ${user.email}.`;
      if (isTradeFormOpen) data += ` The "New Trade" form is currently OPEN.`;
      if (isSearchOpen) data += ` Global search is currently OPEN.`;
      if (isDemoMode) data += ` The user is in DEMO MODE (viewing sample data).`;
      
      // Prevent infinite broadcast chains if state doesn't materially change
      if (data === lastBroadcastRef.current) return;
      lastBroadcastRef.current = data;

      window.dispatchEvent(new CustomEvent('nexus-global-context', {
        detail: {
          source: 'System Navigation',
          data: data
        }
      }));
    };
    
    broadcastContext();
  }, [activeTab, user?.uid, selectedAccountId, isTradeFormOpen, isSearchOpen, isDemoMode]);

  const handleAccountChange = (accNo: string) => {
    setSelectedAccountId(accNo);
  };

  useEffect(() => {
    if (!user) return;
    // Initial data refresh logic if needed
  }, [user]);

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
          "md:static md:translate-x-0 h-full max-h-screen",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full",
          isSidebarOpen && !isSidebarCollapsed && "shadow-2xl",
          isSidebarHidden ? "w-0 border-none opacity-0 pointer-events-none" : (isSidebarCollapsed ? "w-20" : "w-64")
        )}
      >
        <div className={cn("flex h-16 shrink-0 items-center px-6", isSidebarCollapsed ? "justify-center px-0" : "justify-between flex-none")}>
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
        
        <nav className="flex-1 overflow-y-auto min-h-0 space-y-1 px-3 py-4 custom-scrollbar">
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
                "group flex w-full items-center gap-3 rounded-xl transition-all",
                isSidebarCollapsed ? "justify-center px-0 py-3" : "px-3 py-2.5 text-sm font-medium",
                activeTab === tab.id 
                  ? "bg-emerald-500/10 text-emerald-500" 
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              )}
            >
              <tab.icon size={isSidebarCollapsed ? 22 : 18} />
              {!isSidebarCollapsed && (
                <div className="flex flex-1 items-center justify-between min-w-0">
                  <span className="truncate">{tab.label}</span>
                  {tab.id === 'dashboard' && activeAccount && (
                    <span className={cn(
                      "text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md border transition-colors",
                      activeTab === 'dashboard' 
                        ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-500" 
                        : "bg-zinc-800 border-zinc-700 text-zinc-500 group-hover:text-zinc-300"
                    )}>
                      {activeAccount.accountNumber}
                    </span>
                  )}
                </div>
              )}
            </button>
          ))}
        </nav>

    <div className="shrink-0 border-t border-zinc-800 p-4">
      {/* Active Account Info in Sidebar */}
      {!isSidebarCollapsed && activeAccount && (
        <div className="mb-4 px-2 py-3 rounded-xl bg-zinc-950/50 border border-zinc-800/50 overflow-hidden">
          <div className="flex items-center gap-2 mb-1">
             <Database size={12} className="text-emerald-500" />
             <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Active Account</span>
          </div>
          <p className="truncate text-sm font-bold text-zinc-200">
            {activeAccount.name}
          </p>
          <p className="truncate text-[10px] font-mono text-emerald-500/70">
            #{activeAccount.accountNumber}
          </p>
        </div>
      )}

      <div className={cn("flex items-center gap-3 py-1", isSidebarCollapsed ? "flex-col px-0" : "px-2")}>
        <div className="relative group">
          {user?.photoURL ? (
            <img 
              src={user.photoURL} 
              referrerPolicy="no-referrer"
              className="h-9 w-9 shrink-0 rounded-full border border-zinc-700 object-cover shadow-sm transition-transform group-hover:scale-105" 
              alt={user.displayName || 'User'} 
              onError={(e) => {
                // If Google image fails, hide it to show the fallback div
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).parentElement?.querySelector('.avatar-fallback')?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={cn(
            "avatar-fallback h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-500 font-bold text-xs uppercase shadow-inner",
            user?.photoURL ? "hidden" : "flex"
          )}>
            {user?.displayName?.split(' ').map(n => n[0]).join('').slice(0, 2) || (user?.email?.[0] || 'U')}
          </div>
        </div>

        {!isSidebarCollapsed && (
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-bold text-zinc-100">{user?.displayName}</p>
            <p className="truncate text-[10px] text-zinc-500 font-medium">{user?.email}</p>
          </div>
        )}
        
        <button 
          onClick={() => auth.signOut()} 
          className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-400/5 transition-all"
          title="Sign Out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "flex flex-1 flex-col overflow-hidden relative transition-all duration-300",
        // Removed the pl-20 logic that was pushing content off-screen
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
            onClick={() => {
              if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
              } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            className="fixed bottom-6 right-24 md:right-32 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-zinc-100 shadow-lg transition-all hover:bg-zinc-700 hover:scale-110 active:scale-95 animate-in fade-in slide-in-from-bottom-4"
            title="Back to Top"
          >
            <ArrowUp size={24} />
          </button>
        )}

        <header className="flex min-h-[4rem] h-auto md:h-16 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-4 md:px-6 backdrop-blur-xl z-30 sticky top-0 py-2 md:py-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <button 
              onClick={() => {
                if (isSidebarHidden) {
                  setIsSidebarHidden(false);
                  setIsSidebarCollapsed(false);
                  setIsSidebarOpen(true);
                } 
                else if (!isSidebarOpen) {
                  setIsSidebarOpen(true);
                  setIsSidebarCollapsed(false);
                }
                else if (!isSidebarCollapsed) {
                  setIsSidebarCollapsed(true);
                } 
                else {
                  setIsSidebarHidden(true);
                  setIsSidebarOpen(false);
                }
              }}
              className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
              title={isSidebarHidden ? "Show Sidebar" : (isSidebarCollapsed ? "Hide Sidebar" : "Collapse Sidebar")}
            >
              <Menu size={18} />
            </button>
            <div className="flex flex-col min-w-0">
              <h2 className="text-sm sm:text-base md:text-lg font-bold capitalize tracking-tight truncate">{activeTab}</h2>
              {activeAccount && (
                <span className="text-[8px] sm:text-[10px] font-mono text-emerald-500 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20 truncate w-fit">
                  #{activeAccount.accountNumber}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end flex-wrap gap-1 md:gap-3 font-sans ml-2">
            {/* Account Selector */}
            {accounts.length > 0 && (
              <Dropdown
                align="right"
                options={accounts.map(acc => ({
                  id: acc.id,
                  label: acc.name,
                  description: acc.id === acc.accountNumber ? `#${acc.id}` : acc.id,
                  badge: accountsWithTrades.includes(acc.id) ? 'active' : undefined,
                  icon: Database
                }))}
                value={selectedAccountId || ''}
                onChange={handleAccountChange}
                className="w-24 xs:w-32 sm:w-48 lg:w-64"
                triggerClassName="h-8 sm:h-10 px-1.5 sm:px-4 !bg-zinc-950 !border-zinc-800 hover:!border-zinc-700 text-[10px] sm:text-xs"
              />
            )}
            
            <button 
              onClick={() => setIsDemoMode(!isDemoMode)}
              className={cn(
                "flex h-8 sm:h-10 items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-2 sm:px-3 text-[10px] sm:text-xs font-bold transition-all shrink-0",
                isDemoMode 
                  ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" 
                  : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-zinc-100"
              )}
              title={isDemoMode ? "Switch to Real Mode" : "Switch to Demo Mode"}
            >
              <Zap size={12} className={cn("sm:w-3.5 sm:h-3.5", isDemoMode && "fill-amber-500")} />
              <span className="hidden xs:inline">{isDemoMode ? "DEMO" : "REAL"}</span>
            </button>
            <button 
              onClick={() => setIsSearchOpen(true)}
              className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400 transition-all hover:border-zinc-700 hover:text-zinc-100 md:w-auto md:px-3 md:py-2 md:text-sm"
            >
              <Search size={16} />
              <span className="hidden md:ml-2 md:inline">Search...</span>
            </button>
            <button 
              onClick={() => setIsTradeFormOpen(true)}
              className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-zinc-950 transition-all hover:bg-emerald-400 active:scale-95 md:w-auto md:px-4 md:py-2 md:text-sm md:font-medium"
            >
              <Plus size={16} />
              <span className="hidden md:inline">New Trade</span>
            </button>
          </div>
        </header>

        <div 
          ref={scrollContainerRef} 
          className="flex-1 overflow-auto p-4 md:p-6 scroll-smooth custom-scrollbar"
        >
          <div className="mx-auto max-w-6xl space-y-6 md:space-y-8 will-change-transform">
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
                  isDemoMode={isDemoMode}
                  onOpenTradeForm={() => setIsTradeFormOpen(true)} 
                />
              )}
              {activeTab === 'trades' && (
                <TradeList 
                  isDemoMode={isDemoMode}
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
          isDemoMode={isDemoMode}
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

