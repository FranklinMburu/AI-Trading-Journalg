import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, addDoc, onSnapshot, writeBatch, deleteDoc, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserSettings, TradingAccount } from '../types';
import { Settings as SettingsIcon, Save, Bell, Target, DollarSign, Globe, Shield, Smartphone, User as UserIcon, Camera, Mail, Trash2, AlertTriangle, Database, Edit2, Plus, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../firebase';

import { useAccount } from '../contexts/AccountContext';

export default function Settings() {
  const { activeAccount, userAccounts, selectedAccountId, isDemoMode } = useAccount();
  const userId = activeAccount?.userId;
  const accountId = selectedAccountId;
  
  const user = auth.currentUser;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings>({
    userId: userId || '',
    currency: 'USD',
    dailyGoal: 500,
    weeklyGoal: 2500,
    startingBalance: 10000,
    notifications: {
      tp_hit: true,
      sl_hit: true,
      goal_reached: true,
      daily_summary: false
    }
  });

  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [newAccountName, setNewAccountName] = useState('');
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [newAccData, setNewAccData] = useState({ accountNumber: '', name: '', currency: 'USD', broker: '' });

  useEffect(() => {
    if (!userId || !accountId) return;

    const q = query(collection(db, 'users', userId, 'accounts', accountId, 'settings'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setUserSettings(snapshot.docs[0].data() as UserSettings);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'settings');
    });

    return () => unsubscribe();
  }, [userId, accountId]);

  const handleUpdateAccount = async (id: string) => {
    if (!newAccountName.trim() || !userId) return;
    try {
      await updateDoc(doc(db, 'users', userId, 'accounts', id), { name: newAccountName });
      setEditingAccountId(null);
      setNewAccountName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'accounts');
    }
  };

  const handleDeleteAccount = async (accountNumber: string, docId: string) => {
    if (!window.confirm(`Are you sure you want to delete account ${accountNumber}? This will NOT delete trades associated with it, but you will lose the account profile.`)) return;
    if (!userId) return;
    try {
      await deleteDoc(doc(db, 'users', userId, 'accounts', docId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'accounts');
    }
  };

  const handleManualAddAccount = async () => {
    if (!newAccData.accountNumber || !newAccData.name || !userId) return;
    try {
      await addDoc(collection(db, 'users', userId, 'accounts'), {
        userId,
        accountNumber: newAccData.accountNumber,
        name: newAccData.name,
        currency: newAccData.currency,
        broker: newAccData.broker,
        balance: 0,
        equity: 0,
        createdAt: new Date().toISOString(),
        lastUpdate: new Date().toISOString()
      });
      setIsAddingAccount(false);
      setNewAccData({ accountNumber: '', name: '', currency: 'USD', broker: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'accounts');
    }
  };

  const handleSave = async () => {
    if (!userId || !accountId) return;
    setSaving(true);
    try {
      const q = query(collection(db, 'users', userId, 'accounts', accountId, 'settings'));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        await addDoc(collection(db, 'users', userId, 'accounts', accountId, 'settings'), userSettings);
      } else {
        const docRef = doc(db, 'users', userId, 'accounts', accountId, 'settings', snapshot.docs[0].id);
        await updateDoc(docRef, { ...userSettings });
      }
      alert('Settings saved successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings');
    } finally {
      setSaving(false);
    }
  };

  const handleResetData = async () => {
    if (!userId || !accountId) return;
    setResetting(true);
    try {
      const batch = writeBatch(db);
      
      // Delete trades
      const tradesQuery = query(collection(db, 'users', userId, 'accounts', accountId, 'trades'));
      const tradesSnapshot = await getDocs(tradesQuery);
      tradesSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // Delete strategies
      const strategiesQuery = query(collection(db, 'users', userId, 'accounts', accountId, 'strategies'));
      const strategiesSnapshot = await getDocs(strategiesQuery);
      strategiesSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // Delete journal entries
      const journalQuery = query(collection(db, 'users', userId, 'accounts', accountId, 'journal_entries'));
      const journalSnapshot = await getDocs(journalQuery);
      journalSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      
      // Clear local storage cache related to this user-account
      const cachePrefix = `${userId}_${accountId}`;
      Object.keys(localStorage).forEach(key => {
        if (key.includes(cachePrefix)) {
          localStorage.removeItem(key);
        }
      });

      setResetConfirm(false);
      window.location.reload(); 
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'multiple_collections');
    } finally {
      setResetting(false);
    }
  };

  const [mtVersion, setMtVersion] = useState<'mt4' | 'mt5'>('mt5');

  const mt4Script = `// JournalSync EA for TradeFlow (MT4 Version)
#property copyright "TradeFlow.ai"
#property version   "1.20"
#property strict

input string WebhookURL = "${window.location.origin}/api/webhook/trade?userId=${userId}";
input string Secret = ""; 

int last_history_cnt = 0;

int OnInit() {
   last_history_cnt = OrdersHistoryTotal();
   Print("TradeFlow JournalSync Started. Monitoring MT4 Account: ", AccountNumber());
   return(INIT_SUCCEEDED);
}

void OnTick() {
   int current_history = OrdersHistoryTotal();
   if(current_history > last_history_cnt) {
      for(int i = last_history_cnt; i < current_history; i++) {
         if(OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) {
            SendTradeToJournal();
         }
      }
      last_history_cnt = current_history;
   }
}

void SendTradeToJournal() {
   string accountNo = IntegerToString(AccountNumber());
   string finalUrl = WebhookURL + "&accountId=" + accountNo;
   if(Secret != "") finalUrl = finalUrl + "&secret=" + Secret;

   string postData = "{" +
      "\\"symbol\\":\\"" + OrderSymbol() + "\\"," +
      "\\"direction\\":\\"" + (OrderType()==OP_BUY ? "LONG" : "SHORT") + "\\"," +
      "\\"entryPrice\\":" + DoubleToString(OrderOpenPrice(), Digits) + "," +
      "\\"price\\":" + DoubleToString(OrderClosePrice(), Digits) + "," +
      "\\"pnl\\":" + DoubleToString(OrderProfit() + OrderCommission() + OrderSwap(), 2) + "," +
      "\\"quantity\\":" + DoubleToString(OrderLots(), 2) + "," +
      "\\"entryTime\\":\\"" + TimeToString(OrderOpenTime(), TIME_DATE|TIME_SECONDS) + "\\"," +
      "\\"accountId\\":\\"" + accountNo + "\\"" +
   "}";

   char post[], result[];
   string headers = "Content-Type: application/json\\r\\n";
   StringToCharArray(postData, post);
   int res = WebRequest("POST", finalUrl, headers, 10000, post, result, headers);
   if(res == 200) Print("TradeFlow: Trade synced successfully.");
   else Print("TradeFlow: Sync failed. Error: ", res);
}`;

  const mt5Script = `// JournalSync EA for TradeFlow (MT5 Version)
#property strict
#property version "1.10"

input string WebhookURL = "${window.location.origin}/api/webhook/trade?userId=${userId}";
input string Secret = "";
bool SyncHistoryOnStart = false; // Set to true to sync all past trades on first run

ulong lastDealTicket = 0;

int OnInit() {
   Print("TradeFlow JournalSync Started.");
   HistorySelect(0, TimeCurrent());
   int deals = HistoryDealsTotal();
   if(deals > 0) {
      lastDealTicket = HistoryDealGetTicket(deals - 1);
      if(SyncHistoryOnStart) {
         Print("Syncing historical trades...");
         for(int i = 0; i < deals; i++) SendTradeToJournal(HistoryDealGetTicket(i));
      }
   }
   return(INIT_SUCCEEDED);
}

void OnTick() {
   HistorySelect(0, TimeCurrent());
   int deals = HistoryDealsTotal();
   if(deals <= 0) return;
   ulong latestTicket = HistoryDealGetTicket(deals - 1);
   if(latestTicket == lastDealTicket) return;
   lastDealTicket = latestTicket;
   SendTradeToJournal(latestTicket);
}

void SendTradeToJournal(ulong ticket) {
   string symbol = HistoryDealGetString(ticket, DEAL_SYMBOL);
   long type = HistoryDealGetInteger(ticket, DEAL_TYPE);
   if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) return;
   string direction = (type == DEAL_TYPE_BUY) ? "LONG" : "SHORT";
   double entryPrice = HistoryDealGetDouble(ticket, DEAL_PRICE);
   double volume = HistoryDealGetDouble(ticket, DEAL_VOLUME);
   double pnl = HistoryDealGetDouble(ticket, DEAL_PROFIT);
   datetime dealTime = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
   string entryTime = TimeToString(dealTime, TIME_DATE | TIME_SECONDS);
   string accountNo = IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN));
   string finalUrl = WebhookURL + "&accountId=" + accountNo;
   if(Secret != "") finalUrl += "&secret=" + Secret;
   string json = "{\\"symbol\\":\\""+symbol+"\\",\\"direction\\":\\""+direction+"\\",\\"entryPrice\\":"+DoubleToString(entryPrice,2)+",\\"price\\":"+DoubleToString(entryPrice,2)+",\\"pnl\\":"+DoubleToString(pnl,2)+",\\"quantity\\":"+DoubleToString(volume,2)+",\\"entryTime\\":\\""+entryTime+"\\",\\"accountId\\":\\""+accountNo+"\\"}";
   char post[], result[];
   StringToCharArray(json, post);
   string headers = "Content-Type: application/json\\r\\n";
   string responseHeaders;
   int res = WebRequest("POST", finalUrl, headers, 10000, post, result, responseHeaders);
   if(res == 200) Print("TradeFlow: Sync success for ticket ", ticket);
   else Print("TradeFlow: Sync failed for ticket ", ticket, " Error: ", GetLastError());
}`;

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
            <SettingsIcon size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold">Platform Settings</h3>
            <p className="text-sm text-zinc-400">Manage your trading preferences and goals</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-500 active:scale-95 disabled:opacity-50"
        >
          {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save size={18} />}
          Save Changes
        </button>
      </div>

      {/* Profile Section */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="relative group">
            <img 
              src={user?.photoURL || ''} 
              className="h-20 w-20 rounded-2xl border-2 border-zinc-800 object-cover transition-all group-hover:opacity-50" 
              alt={user?.displayName || ''} 
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              <Camera size={20} className="text-white" />
            </div>
          </div>
          <div className="flex-1 space-y-1">
            <h4 className="text-lg font-bold">{user?.displayName}</h4>
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Mail size={14} />
              <span>{user?.email}</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-500">
              <Shield size={12} />
              <span>Verified Account</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Trading Accounts */}
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 md:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-500">
              <Database size={20} />
              <h4 className="font-bold">Managed Accounts</h4>
            </div>
            <button 
              onClick={() => setIsAddingAccount(!isAddingAccount)}
              className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-500 hover:bg-emerald-500/20"
            >
              {isAddingAccount ? <X size={14} /> : <Plus size={14} />}
              {isAddingAccount ? 'Cancel' : 'Add Account'}
            </button>
          </div>

          {isAddingAccount && (
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:grid-cols-4">
              <input 
                placeholder="Acc Number" 
                className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs text-white"
                value={newAccData.accountNumber}
                onChange={e => setNewAccData({...newAccData, accountNumber: e.target.value})}
              />
              <input 
                placeholder="Account Name" 
                className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs text-white"
                value={newAccData.name}
                onChange={e => setNewAccData({...newAccData, name: e.target.value})}
              />
              <select 
                className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs text-white"
                value={newAccData.currency}
                onChange={e => setNewAccData({...newAccData, currency: e.target.value})}
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
              <button 
                onClick={handleManualAddAccount}
                className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-zinc-950"
              >
                Save Account
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {userAccounts.map(acc => (
              <div key={acc.id} className="group relative rounded-xl border border-zinc-800 bg-zinc-950 p-4 transition-all hover:border-emerald-500/30">
                <div className="flex items-start justify-between mb-3">
                  <div className="space-y-0.5">
                    {editingAccountId === acc.id ? (
                      <div className="flex items-center gap-1">
                        <input 
                          autoFocus
                          className="w-24 rounded border border-emerald-500/50 bg-zinc-900 px-1 py-0.5 text-xs text-white outline-none"
                          value={newAccountName}
                          onChange={e => setNewAccountName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleUpdateAccount(acc.id!)}
                        />
                        <button onClick={() => handleUpdateAccount(acc.id!)} className="text-emerald-500"><Save size={12}/></button>
                      </div>
                    ) : (
                      <h5 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                        {acc.name}
                        <button 
                          onClick={() => { setEditingAccountId(acc.id!); setNewAccountName(acc.name); }}
                          className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-emerald-500 transition-opacity"
                        >
                          <Edit2 size={10} />
                        </button>
                      </h5>
                    )}
                    <p className="text-[10px] text-zinc-500">#{acc.accountNumber} • {acc.broker || 'External'}</p>
                  </div>
                  <button 
                    onClick={() => acc.accountNumber && acc.id && handleDeleteAccount(acc.accountNumber, acc.id)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-500 transition-opacity"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-baseline justify-between pt-2 border-t border-zinc-900">
                  <span className="text-[10px] uppercase font-bold text-zinc-600">Balance</span>
                  <span className="text-xs font-mono font-bold text-emerald-500">
                    {acc.currency} {acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            ))}
            {userAccounts.length === 0 && (
              <div className="col-span-full py-8 text-center border-2 border-dashed border-zinc-800 rounded-xl">
                <p className="text-xs text-zinc-500 italic">No accounts linked yet. Use the MQL script or add one manually.</p>
              </div>
            )}
          </div>
        </div>

        {/* Trading Goals */}
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex items-center gap-2 text-blue-500">
            <Target size={20} />
            <h4 className="font-bold">Trading Goals</h4>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-500">Daily Profit Goal</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                <input
                  type="number"
                  value={userSettings.dailyGoal}
                  onChange={(e) => setUserSettings({ ...userSettings, dailyGoal: Number(e.target.value) })}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-500">Weekly Profit Goal</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                <input
                  type="number"
                  value={userSettings.weeklyGoal}
                  onChange={(e) => setUserSettings({ ...userSettings, weeklyGoal: Number(e.target.value) })}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex items-center gap-2 text-purple-500">
            <Globe size={20} />
            <h4 className="font-bold">Preferences</h4>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-500">Starting Balance</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                <input
                  type="number"
                  value={userSettings.startingBalance}
                  onChange={(e) => setUserSettings({ ...userSettings, startingBalance: Number(e.target.value) })}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-500">Base Currency</label>
              <select
                value={userSettings.currency}
                onChange={(e) => setUserSettings({ ...userSettings, currency: e.target.value })}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="JPY">JPY (¥)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 md:col-span-2">
          <div className="flex items-center gap-2 text-emerald-500">
            <Bell size={20} />
            <h4 className="font-bold">Notification Preferences</h4>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { id: 'tp_hit', label: 'Take Profit Hit', desc: 'Notify when a trade hits your target' },
              { id: 'sl_hit', label: 'Stop Loss Hit', desc: 'Notify when a trade hits your stop' },
              { id: 'goal_reached', label: 'Goal Reached', desc: 'Celebrate when daily/weekly goals are met' },
              { id: 'daily_summary', label: 'Daily Summary', desc: 'Get a summary of your trading day' },
            ].map((n) => (
              <div key={n.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 transition-all hover:border-zinc-700">
                <div>
                  <p className="text-sm font-bold">{n.label}</p>
                  <p className="text-[10px] text-zinc-500">{n.desc}</p>
                </div>
                <button
                  onClick={() => setUserSettings({
                    ...userSettings,
                    notifications: { ...userSettings.notifications, [n.id]: !userSettings.notifications[n.id as keyof typeof userSettings.notifications] }
                  })}
                  className={cn(
                    "relative h-6 w-11 rounded-full transition-colors focus:outline-none",
                    userSettings.notifications[n.id as keyof typeof userSettings.notifications] ? "bg-emerald-500" : "bg-zinc-800"
                  )}
                >
                  <div className={cn(
                    "absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform",
                    userSettings.notifications[n.id as keyof typeof userSettings.notifications] ? "translate-x-5" : "translate-x-0"
                  )} />
                </button>
              </div>
            ))}
          </div>
        </div>
        {/* Free Webhook Sync */}
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 md:col-span-2">
          <div className="flex items-center gap-2 text-emerald-500">
            <Globe size={20} />
            <h4 className="font-bold">Free Broker Sync (Webhook Method)</h4>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <p className="text-xs text-zinc-400 leading-relaxed">
                Since MetaApi is now paid, we recommend using the <strong>Free Webhook Method</strong>. 
                This uses a small script in your MetaTrader that pushes trades to your journal for free, 
                automatically detecting your unique account number to prevent mixed data.
              </p>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <p className="text-[10px] font-bold uppercase text-emerald-500 mb-1">Your Base Webhook URL:</p>
                <div className="flex items-center gap-2 rounded bg-zinc-950 p-2">
                  <code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-emerald-400">
                    {window.location.origin}/api/webhook/trade?userId={userId}
                  </code>
                  <button 
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/webhook/trade?userId=${userId}`)}
                    className="text-[10px] font-bold text-zinc-500 hover:text-emerald-500"
                  >
                    Copy
                  </button>
                </div>
                <p className="mt-2 text-[8px] text-zinc-500 italic">* The EA will automatically append &accountId=[AccountNo] to distinguish your accounts.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-[10px] font-bold uppercase text-zinc-500 mb-2">Setup Steps:</p>
                <ul className="space-y-2 text-[10px] text-zinc-400">
                  <li className="flex gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[8px] font-bold">1</span>
                    <span>In MT4/MT5, go to <strong>Tools &gt; Options &gt; Expert Advisors</strong></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[8px] font-bold">2</span>
                    <span>Check <strong>"Allow WebRequest for listed URL"</strong></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[8px] font-bold">3</span>
                    <span>Add your App URL: <code className="text-emerald-500">{window.location.origin}</code></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[8px] font-bold">4</span>
                    <span>Paste the MQL code below into MetaEditor and compile as an EA (JournalSync).</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* MQL Code Block */}
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase text-zinc-500">MQL Script (Copy to MetaEditor)</p>
                <div className="mt-2 flex gap-2">
                  <button 
                    onClick={() => setMtVersion('mt4')}
                    className={cn(
                      "rounded-lg px-3 py-1 text-[10px] font-bold transition-all",
                      mtVersion === 'mt4' ? "bg-emerald-500 text-zinc-950" : "bg-zinc-900 text-zinc-500 hover:bg-zinc-800"
                    )}
                  >
                    MT4 Version
                  </button>
                  <button 
                    onClick={() => setMtVersion('mt5')}
                    className={cn(
                      "rounded-lg px-3 py-1 text-[10px] font-bold transition-all",
                      mtVersion === 'mt5' ? "bg-emerald-500 text-zinc-950" : "bg-zinc-900 text-zinc-500 hover:bg-zinc-800"
                    )}
                  >
                    MT5 Version
                  </button>
                </div>
              </div>
              <button 
                onClick={() => navigator.clipboard.writeText(mtVersion === 'mt4' ? mt4Script : mt5Script)}
                className="text-[10px] font-bold text-blue-500 hover:text-blue-400"
              >
                Copy Full {mtVersion.toUpperCase()} Script
              </button>
            </div>
            <pre className="max-h-48 overflow-y-auto rounded-lg bg-zinc-900 p-3 text-[9px] text-zinc-400 font-mono">
              {mtVersion === 'mt4' ? mt4Script : mt5Script}
            </pre>
            <div className="mt-2 rounded bg-blue-500/5 p-2 text-[8px] text-blue-400 border border-blue-500/10">
              {mtVersion === 'mt5' ? (
                <span><strong>Pro Tip:</strong> Setting <code>SyncHistoryOnStart = true;</code> in the script will sync your entire MT5 trade history to the journal on the first run.</span>
              ) : (
                <span><strong>Note:</strong> MT4 version syncs new trades. For historical data on MT4, please use the manual import or contact support for a bulk sync tool.</span>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Trading Guide */}
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 md:col-span-2">
          <div className="flex items-center gap-2 text-blue-500">
            <Smartphone size={20} />
            <h4 className="font-bold">Mobile Trading Guide (MT4/MT5 App)</h4>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <p className="text-xs text-zinc-400 leading-relaxed">
                MetaTrader mobile apps do not support custom scripts. To sync trades executed on your phone, you need a <strong>"Sync Bridge"</strong>.
              </p>
              <div className="space-y-3">
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                  <p className="text-xs font-bold text-blue-500 mb-1">The PC/VPS Bridge Method:</p>
                  <p className="text-[10px] text-zinc-400 leading-relaxed">
                    1. Log into your Exness account on a PC or VPS.<br/>
                    2. Install the <strong>JournalSync EA</strong> on the PC terminal.<br/>
                    3. Leave the PC terminal running.<br/>
                    4. <strong>Trade on your phone!</strong> The PC terminal will detect the trade and sync it here automatically.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-[10px] font-bold uppercase text-zinc-500 mb-2">Pro Tip: Use a VPS</p>
                <p className="text-[10px] text-zinc-400 leading-relaxed">
                  A VPS (Virtual Private Server) stays on 24/7. Many brokers like Exness offer a <strong>Free VPS</strong> if you maintain a minimum balance. This ensures your mobile trades are synced even when your computer is off.
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-[10px] font-bold uppercase text-zinc-500 mb-2">Manual Fallback</p>
                <p className="text-[10px] text-zinc-400 leading-relaxed">
                  If you don't have a PC/VPS, you can always use the <strong>"Add Trade"</strong> button in the Trades tab to manually log your phone executions in seconds.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="space-y-4 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6 md:col-span-2">
          <div className="flex items-center gap-2 text-rose-500">
            <AlertTriangle size={20} />
            <h4 className="font-bold">Danger Zone</h4>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-zinc-200">Reset All Data</p>
              <p className="text-xs text-zinc-500">Permanently delete all trades and strategies from your account. This cannot be undone.</p>
            </div>
            
            {!resetConfirm ? (
              <button
                onClick={() => setResetConfirm(true)}
                className="flex items-center gap-2 rounded-xl bg-rose-500/10 px-6 py-2.5 text-sm font-bold text-rose-500 transition-all hover:bg-rose-500 hover:text-white"
              >
                <Trash2 size={18} />
                Reset Journal
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setResetConfirm(false)}
                  className="rounded-xl bg-zinc-800 px-4 py-2 text-xs font-bold text-zinc-400 transition-all hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetData}
                  disabled={resetting}
                  className="flex items-center gap-2 rounded-xl bg-rose-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-600/20 transition-all hover:bg-rose-500 active:scale-95 disabled:opacity-50"
                >
                  {resetting ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <Trash2 size={18} />
                  )}
                  Confirm Permanent Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
