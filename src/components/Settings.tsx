import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, addDoc, onSnapshot, writeBatch, deleteDoc, orderBy, setDoc, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserSettings, TradingAccount } from '../types';
import { Settings as SettingsIcon, Save, Bell, Target, DollarSign, RefreshCw, Globe, Shield, Smartphone, User as UserIcon, Camera, Mail, Trash2, AlertTriangle, Database, Edit2, Plus, X, Lock, Key, Activity, Clock, Zap, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../firebase';
import { format } from 'date-fns';

import { useAccount } from '../contexts/AccountContext';

export default function Settings() {
  const { activeAccount, userAccounts, selectedAccountId, isDemoMode, user: contextUser } = useAccount();
  const userId = contextUser?.uid;
  const accountId = selectedAccountId;
  
  const user = contextUser || auth.currentUser;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoadingLogs(true);
    const logsQuery = query(
      collection(db, 'users', userId, 'webhook_logs'),
      orderBy('timestamp', 'desc'),
      limit(5)
    );
    return onSnapshot(logsQuery, (snapshot) => {
      setWebhookLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingLogs(false);
    }, () => setLoadingLogs(false));
  }, [userId]);
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
      const accountDocId = newAccData.accountNumber.replace(/[^a-zA-Z0-9]/g, "_");
      await setDoc(doc(db, 'users', userId, 'accounts', accountDocId), {
        userId,
        accountNumber: newAccData.accountNumber,
        name: newAccData.name,
        currency: newAccData.currency,
        broker: newAccData.broker || 'Manual',
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
  const [syncHistoryOnStart, setSyncHistoryOnStart] = useState(false);

  const mt4Script = `// JournalSync EA for TradeFlow (MT4 Version)
#property copyright "TradeFlow.ai"
#property version   "1.20"
#property strict

input string WebhookURL = "${window.location.origin}/api/webhook/trade?userId=${userId || ''}";
input string Secret = ""; 
input bool SyncHistoryOnStart = ${syncHistoryOnStart}; // Set to true to sync all past trades on first run

int last_history_cnt = 0;

int OnInit() {
   last_history_cnt = OrdersHistoryTotal();
   Print("TradeFlow JournalSync Started. Monitoring MT4 Account: ", AccountNumber());
   
   if(SyncHistoryOnStart && last_history_cnt > 0) {
      Print("Syncing historical trades...");
      for(int i = 0; i < last_history_cnt; i++) {
         if(OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) SendTradeToJournal();
      }
   }
   
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
   int type = OrderType();
   if(type != OP_BUY && type != OP_SELL) return;
   
   string accountNo = IntegerToString(AccountNumber());
   string finalUrl = WebhookURL + "&accountId=" + accountNo;
   if(Secret != "") finalUrl = finalUrl + "&secret=" + Secret;

   bool isDemo = IsDemo();
   datetime closeTime = OrderCloseTime();
   string status = (closeTime == 0) ? "OPEN" : "CLOSED";
   
   string postData = "{" +
      "\\"ticket\\":\\"" + IntegerToString(OrderTicket()) + "\\"," +
      "\\"isDemo\\":" + (isDemo ? "true" : "false") + "," +
      "\\"status\\":\\"" + status + "\\"," +
      "\\"symbol\\":\\"" + OrderSymbol() + "\\"," +
      "\\"direction\\":\\"" + (OrderType()==OP_BUY ? "LONG" : "SHORT") + "\\"," +
      "\\"entryPrice\\":" + DoubleToString(OrderOpenPrice(), Digits) + "," +
      "\\"exitPrice\\":" + DoubleToString(OrderClosePrice(), Digits) + "," +
      "\\"pnl\\":" + DoubleToString(OrderProfit() + OrderCommission() + OrderSwap(), 2) + "," +
      "\\"quantity\\":" + DoubleToString(OrderLots(), 2) + "," +
      "\\"entryTime\\":\\"" + TimeToString(OrderOpenTime(), TIME_DATE|TIME_SECONDS) + "\\"," +
      (status == "CLOSED" ? "\\"exitTime\\":\\"" + TimeToString(closeTime, TIME_DATE|TIME_SECONDS) + "\\"," : "") +
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

input string WebhookURL = "${window.location.origin}/api/webhook/trade?userId=${userId || ''}";
input string Secret = "";
input bool SyncHistoryOnStart = ${syncHistoryOnStart}; // Set to true to sync all past trades on first run

ulong lastDealTicket = 0;

int OnInit() {
   Print("TradeFlow JournalSync Started.");
   HistorySelect(0, TimeCurrent());
   int deals = HistoryDealsTotal();
   if(deals > 0) {
      ulong ticket = HistoryDealGetTicket(deals - 1);
      if(ticket > 0) lastDealTicket = ticket;
      if(SyncHistoryOnStart) {
         Print("Syncing historical trades...");
         for(int i = 0; i < deals; i++) {
            ulong t = HistoryDealGetTicket(i);
            if(t > 0) SendTradeToJournal(t);
         }
      }
   }
   return(INIT_SUCCEEDED);
}

void OnTick() {
   if(!HistorySelect(0, TimeCurrent())) return;
   int deals = HistoryDealsTotal();
   if(deals <= 0) return;
   
   ulong latestTicket = HistoryDealGetTicket(deals - 1);
   if(latestTicket <= 0 || latestTicket == lastDealTicket) return;
   
   lastDealTicket = latestTicket;
   SendTradeToJournal(latestTicket);
}

void SendTradeToJournal(ulong ticket) {
   if(ticket <= 0) return;
   
   if(!HistoryDealSelect(ticket)) {
      Print("TradeFlow: Failed to select ticket ", ticket);
      return;
   }

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
   uint entryOut = (uint)HistoryDealGetInteger(ticket, DEAL_ENTRY);
   string status = (entryOut == DEAL_ENTRY_OUT) ? "CLOSED" : "OPEN";
   bool isDemo = (AccountInfoInteger(ACCOUNT_TRADE_MODE) != ACCOUNT_TRADE_MODE_REAL);
   
   // For CLOSED deals, we want to know the entry deal to get the entry time/price
   double openPrice = entryPrice;
   datetime openTime = dealTime;
   if(status == "CLOSED") {
      long posId = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      if(HistorySelectByPosition(posId)) {
         int posDeals = HistoryDealsTotal();
         for(int i=0; i<posDeals; i++) {
            ulong t = HistoryDealGetTicket(i);
            if(HistoryDealGetInteger(t, DEAL_ENTRY) == DEAL_ENTRY_IN) {
               openPrice = HistoryDealGetDouble(t, DEAL_PRICE);
               openTime = (datetime)HistoryDealGetInteger(t, DEAL_TIME);
               break;
            }
         }
      }
   }

   string json = StringFormat("{\\"ticket\\":\\"%llu\\",\\"status\\":\\"%s\\",\\"isDemo\\":%s,\\"symbol\\":\\"%s\\",\\"direction\\":\\"%s\\",\\"entryPrice\\":%f,\\"exitPrice\\":%f,\\"pnl\\":%f,\\"quantity\\":%f,\\"entryTime\\":\\"%s\\"%s,\\"accountId\\":\\"%s\\"}",
      ticket, status, (isDemo?"true":"false"), symbol, direction, openPrice, entryPrice, pnl, volume, TimeToString(openTime, TIME_DATE|TIME_SECONDS), 
      (status == "CLOSED" ? ",\\"exitTime\\":\\"" + TimeToString(dealTime, TIME_DATE|TIME_SECONDS) + "\\"" : ""), accountNo);
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

        {/* Webhook Security */}
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 md:col-span-2">
          <div className="flex items-center gap-2 text-rose-500">
            <Lock size={20} />
            <h4 className="font-bold">Webhook Security</h4>
          </div>
          <div className="space-y-4">
            <p className="text-xs text-zinc-400">
              Set a secret key to authenticate trade data from your MetaTrader terminal. 
              This prevents unauthorized data from being sent to your journal.
            </p>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
              <input
                type="text"
                placeholder="Enter a secret key (e.g. my-secure-key-123)"
                value={userSettings.webhookSecret || ''}
                onChange={(e) => setUserSettings({ ...userSettings, webhookSecret: e.target.value })}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-10 pr-4 text-sm focus:border-rose-500 focus:outline-none"
              />
            </div>
            {userSettings.webhookSecret && (
              <p className="text-[10px] text-zinc-500 italic">
                Remember to also set this secret in your MT4/MT5 EA's "Secret" input field.
              </p>
            )}
          </div>
        </div>

        {/* Sync Controls */}
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 md:col-span-2">
          <div className="flex items-center gap-2 text-blue-500">
            <RefreshCw size={20} />
            <h4 className="font-bold">Journal Sync Controls</h4>
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-950/50 border border-zinc-800">
            <div>
              <p className="text-sm font-bold text-zinc-100">Include All History on Start</p>
              <p className="text-xs text-zinc-500">Automatically sync your entire trading history when the EA starts.</p>
            </div>
            <button
               onClick={() => setSyncHistoryOnStart(!syncHistoryOnStart)}
               className={cn(
                 "relative h-6 w-11 rounded-full transition-colors focus:outline-none",
                 syncHistoryOnStart ? "bg-blue-500" : "bg-zinc-800"
               )}
            >
              <div className={cn(
                "absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform",
                syncHistoryOnStart ? "translate-x-5" : "translate-x-0"
              )} />
            </button>
          </div>
        </div>

        {/* Notification Preferences */}
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
          
          {!userId && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-amber-500">
              <AlertTriangle size={20} />
              <div className="text-xs">
                <p className="font-bold">Authentication Required</p>
                <p className="opacity-80">You must be logged in to generate a valid sync script. Please refresh the page or sign in again.</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <p className="text-xs text-zinc-400 leading-relaxed">
                Since MetaApi is now paid, we recommend using the <strong>Free Webhook Method</strong>. 
                This uses a small script in your MetaTrader that pushes trades to your journal for free, 
                automatically detecting your unique account number to prevent mixed data.
              </p>
              <div className={cn(
                "rounded-xl border p-4 transition-all",
                userId ? "border-emerald-500/20 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900/50 opacity-50 grayscale pointer-events-none"
              )}>
                <p className="text-[10px] font-bold uppercase text-emerald-500 mb-1">Your Base Webhook URL:</p>
                <div className="flex items-center gap-2 rounded bg-zinc-950 p-2">
                  <code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-emerald-400">
                    {window.location.origin}/api/webhook/trade?userId={userId || 'auth_token_missing'}{userSettings.webhookSecret ? `&secret=${userSettings.webhookSecret}` : ''}
                  </code>
                  <button 
                    disabled={!userId}
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/webhook/trade?userId=${userId}${userSettings.webhookSecret ? `&secret=${userSettings.webhookSecret}` : ''}`)}
                    className="text-[10px] font-bold text-zinc-500 hover:text-emerald-500 disabled:opacity-30"
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
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                  <Shield size={16} className="text-emerald-500" />
                  JournalSync EA (Safe Connection)
                </h4>
                <p className="mt-1 text-xs text-zinc-500">
                  Secure local sync: No broker credentials or passwords required.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button 
                    onClick={() => setMtVersion('mt4')}
                    className={cn(
                      "rounded-lg px-3 py-1 text-[10px] font-bold transition-all border",
                      mtVersion === 'mt4' ? "bg-zinc-100 text-zinc-950 border-zinc-100" : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:bg-zinc-800"
                    )}
                  >
                    MT4 Version
                  </button>
                  <button 
                    onClick={() => setMtVersion('mt5')}
                    className={cn(
                      "rounded-lg px-3 py-1 text-[10px] font-bold transition-all border",
                      mtVersion === 'mt5' ? "bg-zinc-100 text-zinc-950 border-zinc-100" : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:bg-zinc-800"
                    )}
                  >
                    MT5 Version
                  </button>
                  <button 
                    onClick={() => setSyncHistoryOnStart(!syncHistoryOnStart)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-1 text-[10px] font-bold transition-all border",
                      syncHistoryOnStart 
                        ? "bg-blue-500/10 border-blue-500/50 text-blue-400" 
                        : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800"
                    )}
                  >
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      syncHistoryOnStart ? "bg-blue-400 animate-pulse" : "bg-zinc-700"
                    )} />
                    Include All History
                  </button>
                </div>
              </div>
              <button 
                disabled={!userId}
                onClick={() => {
                  navigator.clipboard.writeText(mtVersion === 'mt4' ? mt4Script : mt5Script);
                  alert(`${mtVersion.toUpperCase()} Script copied to clipboard!`);
                }}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-blue-500 disabled:opacity-50 disabled:grayscale"
              >
                Copy {mtVersion.toUpperCase()} Script
              </button>
            </div>
            
            <div className={cn(
              "relative group transition-all",
              !userId && "opacity-20 blur-[2px] pointer-events-none"
            )}>
              <pre 
                className="max-h-64 overflow-y-auto rounded-xl bg-zinc-900/50 border border-zinc-800 p-4 text-[9px] text-zinc-400 font-mono leading-relaxed"
              >
                {mtVersion === 'mt4' ? mt4Script : mt5Script}
              </pre>
              <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none rounded-b-xl" />
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-[10px]">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
                <span className="font-bold text-zinc-300 block mb-2 uppercase tracking-wider">How to install</span>
                <ol className="list-decimal list-inside space-y-1.5 text-zinc-500">
                  <li>Open MetaTrader on your PC</li>
                  <li>Go to <span className="text-zinc-300">Tools → MetaQuotes Language Editor</span></li>
                  <li>Click <span className="text-zinc-300">New → Expert Advisor</span> and name it "JournalSync"</li>
                  <li>Delete all code there and <span className="text-zinc-300">Paste</span> the script above</li>
                  <li>Press <span className="text-emerald-500 font-bold">Compile</span> (F7)</li>
                  <li>Go to MetaTrader <span className="text-zinc-300">Tools → Options → Expert Advisors</span></li>
                  <li>Check <span className="text-zinc-300">"Allow WebRequest for listed URL"</span> and add: <span className="text-blue-400 font-mono tracking-tighter">{window.location.host}</span></li>
                  <li>Drag "JournalSync" from the Navigator to any chart</li>
                  <li>In the <span className="text-zinc-300">Inputs</span> tab, set <span className="text-blue-400 font-bold">SyncHistoryOnStart</span> to <span className="text-emerald-400">true</span></li>
                </ol>
              </div>
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                <span className="font-bold text-blue-400 block mb-2 uppercase tracking-wider text-center flex items-center justify-center gap-2">
                  <RefreshCw size={12} className="animate-spin" />
                  Past Trades Sync
                </span>
                <p className="text-zinc-500 leading-relaxed">
                  {syncHistoryOnStart 
                    ? "✅ The script is now set to sync EVERY trade in your history the moment you attach it to a chart. Good for first-time setup!"
                    : "By default, the script only syncs NEW trades that close while it's running. Toggle 'Include All History' above if you want to import your entire Exness history."}
                </p>
                <div className="mt-3 pt-3 border-t border-blue-500/10 text-center">
                  <p className="text-[9px] text-blue-400/70 font-medium">Syncs automatically. No broker login required.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Webhook Activity diagnostic */}
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 md:col-span-2 shadow-inner">
          <div className="flex items-center gap-2 mb-1">
            <Activity size={20} className="text-emerald-500" />
            <h4 className="font-bold">Recent Sync Activity</h4>
            <button 
              onClick={async () => {
                try {
                  const url = `${window.location.origin}/api/webhook/trade?userId=${userId}`;
                  const res = await fetch(url);
                  const data = await res.json();
                  alert(`Connection Test ${data.status === 'LISTEN_ACTIVE' ? 'SUCCESS' : 'FAILED'}\nServer message: ${data.message}`);
                } catch (e) {
                  alert("Failed to reach server. Please check your internet connection.");
                }
              }}
              className="ml-auto flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-[9px] font-bold text-emerald-500 hover:bg-emerald-500/20"
            >
              <Zap size={10} />
              Test Server URL
            </button>
            <button 
              onClick={async () => {
                try {
                  const url = `${window.location.origin}/api/debug/sync?userId=${userId}`;
                  const res = await fetch(url);
                  const data = await res.json();
                  console.log("[Diagnostic Data]", data);
                  
                  if (data.error) {
                    alert(`Diagnostic Error: ${data.error}\nCode: ${data.code}\n\nCheck browser console for more details.`);
                    return;
                  }

                  const accountStats = data.accounts.map((a: any) => 
                    `Account: ${a.id}\n- Trades: ${a.tradeCount}\n- Demo trades: ${a.trades.filter((t:any) => t.isDemo).length}\n- Real trades: ${a.trades.filter((t:any) => !t.isDemo).length}`
                  ).join('\n\n');

                  alert(`Diagnostic Complete\n\nAccounts Found: ${data.accountsFound}\nSelected ID: ${selectedAccountId}\nDashboard Mode: ${isDemoMode ? 'DEMO' : 'REAL'}\n\n${accountStats || 'No accounts found.'}`);
                } catch (e) {
                  alert("Diagnostic failed to reach server.");
                }
              }}
              className="ml-2 flex items-center gap-1 rounded-lg bg-blue-500/10 px-2 py-1 text-[9px] font-bold text-blue-500 hover:bg-blue-500/20"
            >
              <Activity size={10} />
              Diagnostic Sync
            </button>
            <button 
              onClick={async () => {
                try {
                  const url = `${window.location.origin}/api/debug/test-write`;
                  const res = await fetch(url);
                  const data = await res.json();
                  if (data.success) {
                    alert("Admin SDK Write Test: SUCCESS\nPath: " + data.path);
                  } else {
                    alert("Admin SDK Write Test: FAILED\n" + data.error);
                  }
                } catch (e) {
                  alert("Test write failed to reach server.");
                }
              }}
              className="ml-2 flex items-center gap-1 rounded-lg bg-orange-500/10 px-2 py-1 text-[9px] font-bold text-orange-500 hover:bg-orange-500/20"
            >
              <Database size={10} />
              Test Write
            </button>
            <button 
              onClick={async () => {
                try {
                  const url = `${window.location.origin}/api/debug/auth-check`;
                  const res = await fetch(url);
                  const data = await res.json();
                  if (data.success) {
                    alert("Admin SDK Auth: SUCCESS\n" + data.message);
                  } else {
                    alert("Admin SDK Auth: FAILED\n" + data.error + "\n\n" + data.details);
                  }
                } catch (e) {
                  alert("Auth check failed to reach server.");
                }
              }}
              className="ml-2 flex items-center gap-1 rounded-lg bg-purple-500/10 px-2 py-1 text-[9px] font-bold text-purple-500 hover:bg-purple-500/20"
            >
              <ShieldCheck size={10} />
              Auth Check
            </button>
          </div>
          <p className="text-[10px] text-zinc-500 mb-4 px-1">
            <b>Troubleshooting:</b> If "Recent Activity" is empty, ensure you have added <code>{window.location.origin}</code> to MT5 → Tools → Options → Expert Advisors → <b>Allow WebRequest</b>.
          </p>
          
          <div className="space-y-2">
            {webhookLogs.length > 0 ? (
              webhookLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between rounded-xl bg-zinc-950/80 p-3 border border-zinc-900 animate-in slide-in-from-right-4 duration-300">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      log.status === 'SUCCESS' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : 
                      log.status === 'PENDING' ? "bg-amber-500 animate-pulse" : "bg-rose-500"
                    )} />
                    <div>
                      <p className="text-[10px] font-bold text-zinc-200">
                         Request processed for account(s): {log.accountIds?.join(', ') || 'Unknown'}
                      </p>
                      <p className="text-[9px] text-zinc-500">
                        {log.itemCount || log.payloadSize || 0} trade items received • Source: {log.clientIp || log.ip || 'Remote MT5'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[9px] font-mono text-emerald-500/70">
                    {log.timestamp ? format(new Date(log.timestamp), 'HH:mm:ss') : 'Just now'}
                  </span>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center rounded-xl bg-zinc-900/20 border border-dashed border-zinc-800">
                <Clock size={24} className="text-zinc-700 mb-2" />
                <p className="text-xs text-zinc-500">No sync activity detected in this session yet.</p>
                <p className="text-[10px] text-zinc-600 mt-1 max-w-[200px]">Once you attach the EA in MT5 and a trade closes, it will appear here instantly.</p>
              </div>
            )}
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
