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
import { Layout, TrendingUp, History as HistoryIcon, BookOpen, Brain, LogOut, Plus, User as UserIcon, ChevronRight, AlertCircle, Target, Calendar as CalendarIcon, Menu, X, Shield, Globe, LineChart as LineChartIcon, CheckCircle, Calculator, Database, Search, Command, Loader2 } from 'lucide-react';
import { cn } from './lib/utils';
import { db, handleFirestoreError, OperationType } from './firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Trade, Strategy, JournalEntry } from './types';

// Lazy load components for performance
const Dashboard = lazy(() => import('./components/Dashboard'));
const TradeForm = lazy(() => import('./components/TradeForm'));
const TradeList = lazy(() => import('./components/TradeList'));
const AIInsights = lazy(() => import('./components/AIInsights'));
const Journal = lazy(() => import('./components/Journal'));
const StrategyAnalysis = lazy(() => import('./components/StrategyAnalysis'));
const Calendar = lazy(() => import('./components/Calendar'));
const Settings = lazy(() => import('./components/Settings'));
const NotificationManager = lazy(() => import('./components/NotificationManager'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const EconomicCalendar = lazy(() => import('./components/EconomicCalendar'));
const EquityForecaster = lazy(() => import('./components/EquityForecaster'));
const PreFlightChecklist = lazy(() => import('./components/PreFlightChecklist'));
const RiskCalculator = lazy(() => import('./components/RiskCalculator'));
const DataExplorer = lazy(() => import('./components/DataExplorer'));
const LandingPage = lazy(() => import('./components/LandingPage'));
const GlobalSearch = lazy(() => import('./components/GlobalSearch'));

type Tab = 'dashboard' | 'trades' | 'journal' | 'insights' | 'strategy' | 'calendar' | 'settings' | 'admin' | 'economic' | 'forecasting' | 'preflight' | 'risk' | 'explorer';

// Loading fallback component
const TabLoading = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      <p className="text-sm text-zinc-500 font-medium">Loading content...</p>
    </div>
  </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isTradeFormOpen, setIsTradeFormOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);
  const [preSelectedTradeId, setPreSelectedTradeId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Sync user profile
        const userRef = doc(db, 'users', user.uid);
        try {
          const userDoc = await getDoc(userRef);
          const now = new Date().toISOString();
          
          if (!userDoc.exists()) {
            const isDefaultAdmin = user.email === 'franklinmburu05@gmail.com' || user.email === 'franklinvidal198@gmail.com';
            await setDoc(userRef, {
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL,
              role: isDefaultAdmin ? 'admin' : 'user',
              createdAt: now,
              lastLogin: now
            });
            setIsAdmin(isDefaultAdmin);
          } else {
            const userData = userDoc.data();
            const isDefaultAdmin = user.email === 'franklinmburu05@gmail.com' || user.email === 'franklinvidal198@gmail.com';
            const shouldBeAdmin = isDefaultAdmin || userData.role === 'admin';
            
            setIsAdmin(shouldBeAdmin);
            await updateDoc(userRef, {
              lastLogin: now,
              displayName: user.displayName,
              photoURL: user.photoURL,
              role: shouldBeAdmin ? 'admin' : 'user'
            });
          }
        } catch (error) {
          console.error('Error syncing user profile:', error);
        }
      } else {
        setIsAdmin(false);
      }
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
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
    { id: 'economic', label: 'Economic Calendar', icon: Globe },
    { id: 'forecasting', label: 'Equity Forecaster', icon: LineChartIcon },
    { id: 'explorer', label: 'Data Explorer', icon: Database },
    { id: 'settings', label: 'Settings', icon: UserIcon },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: Shield }] : []),
  ], [isAdmin]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <LandingPage onSignIn={signInWithGoogle} />;
  }

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
        "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-zinc-800 bg-zinc-900 transition-all duration-300 ease-in-out md:static md:flex md:translate-x-0",
        isSidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
        isSidebarHidden ? "w-0 border-none overflow-hidden" : (isSidebarCollapsed ? "w-20" : "w-64")
      )}>
        <div className={cn("flex h-16 items-center px-6", isSidebarCollapsed ? "justify-center px-0" : "justify-between")}>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <TrendingUp size={20} />
            </div>
            {!isSidebarCollapsed && <span className="text-lg font-bold tracking-tight">TradeFlow</span>}
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
            <img src={user.photoURL || ''} className="h-8 w-8 shrink-0 rounded-full border border-zinc-700" alt={user.displayName || ''} />
            {!isSidebarCollapsed && (
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium">{user.displayName}</p>
                <p className="truncate text-xs text-zinc-500">{user.email}</p>
              </div>
            )}
            <button onClick={logout} className="text-zinc-500 hover:text-zinc-100 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex flex-1 flex-col overflow-hidden relative">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/30 px-4 md:px-6 backdrop-blur-md z-30">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <Menu size={20} />
            </button>
            <button 
              onClick={() => {
                if (isSidebarHidden) {
                  setIsSidebarHidden(false);
                  setIsSidebarCollapsed(false);
                } else if (!isSidebarCollapsed) {
                  setIsSidebarCollapsed(true);
                } else {
                  setIsSidebarHidden(true);
                }
              }}
              className="hidden md:flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
              title={isSidebarHidden ? "Show Sidebar" : (isSidebarCollapsed ? "Hide Sidebar" : "Collapse Sidebar")}
            >
              <Menu size={20} />
            </button>
            <h2 className="text-lg font-bold capitalize tracking-tight">{activeTab}</h2>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
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
            <Suspense fallback={<TabLoading />}>
              {activeTab === 'dashboard' && <Dashboard userId={user.uid} />}
              {activeTab === 'trades' && (
                <TradeList 
                  userId={user.uid} 
                  onJournalTrade={(id) => {
                    setPreSelectedTradeId(id);
                    setActiveTab('journal');
                  }}
                />
              )}
              {activeTab === 'calendar' && <Calendar userId={user.uid} />}
              {activeTab === 'strategy' && <StrategyAnalysis userId={user.uid} />}
              {activeTab === 'journal' && (
                <Journal 
                  userId={user.uid} 
                  initialTradeId={preSelectedTradeId || undefined}
                  onClearInitialTrade={() => setPreSelectedTradeId(null)}
                />
              )}
              {activeTab === 'insights' && <AIInsights userId={user.uid} />}
              {activeTab === 'preflight' && <PreFlightChecklist userId={user.uid} />}
              {activeTab === 'risk' && <RiskCalculator userId={user.uid} />}
              {activeTab === 'economic' && <EconomicCalendar userId={user.uid} />}
              {activeTab === 'forecasting' && <EquityForecaster userId={user.uid} />}
              {activeTab === 'explorer' && <DataExplorer userId={user.uid} isAdmin={isAdmin} />}
              {activeTab === 'settings' && <Settings userId={user.uid} />}
              {activeTab === 'admin' && isAdmin && <AdminDashboard />}
            </Suspense>
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

      {isSearchOpen && (
        <GlobalSearch 
          userId={user.uid} 
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
      <NotificationManager userId={user.uid} />
    </div>
  );
}

