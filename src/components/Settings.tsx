import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, addDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserSettings } from '../types';
import { Settings as SettingsIcon, Save, Bell, Target, DollarSign, Globe, Shield, Smartphone, User as UserIcon, Camera, Mail, Trash2, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../firebase';

export default function Settings({ userId }: { userId: string }) {
  const user = auth.currentUser;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({
    userId,
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

  useEffect(() => {
    const q = query(collection(db, 'settings'), where('userId', '==', userId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setSettings(snapshot.docs[0].data() as UserSettings);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'settings');
    });
    return () => unsubscribe();
  }, [userId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const q = query(collection(db, 'settings'), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        await addDoc(collection(db, 'settings'), settings);
      } else {
        const docRef = doc(db, 'settings', snapshot.docs[0].id);
        await updateDoc(docRef, { ...settings });
      }
      alert('Settings saved successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings');
    } finally {
      setSaving(false);
    }
  };

  const handleResetData = async () => {
    setResetting(true);
    try {
      const batch = writeBatch(db);
      
      // Delete trades
      const tradesQuery = query(collection(db, 'trades'), where('userId', '==', userId));
      const tradesSnapshot = await getDocs(tradesQuery);
      tradesSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // Delete strategies
      const strategiesQuery = query(collection(db, 'strategies'), where('userId', '==', userId));
      const strategiesSnapshot = await getDocs(strategiesQuery);
      strategiesSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      
      // Clear local storage cache related to this user
      Object.keys(localStorage).forEach(key => {
        if (key.includes(userId)) {
          localStorage.removeItem(key);
        }
      });

      setResetConfirm(false);
      window.location.reload(); // Refresh to clear state across the app
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'multiple_collections');
    } finally {
      setResetting(false);
    }
  };

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
                  value={settings.dailyGoal}
                  onChange={(e) => setSettings({ ...settings, dailyGoal: Number(e.target.value) })}
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
                  value={settings.weeklyGoal}
                  onChange={(e) => setSettings({ ...settings, weeklyGoal: Number(e.target.value) })}
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
                  value={settings.startingBalance}
                  onChange={(e) => setSettings({ ...settings, startingBalance: Number(e.target.value) })}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-500">Base Currency</label>
              <select
                value={settings.currency}
                onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
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
                  onClick={() => setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, [n.id]: !settings.notifications[n.id as keyof typeof settings.notifications] }
                  })}
                  className={cn(
                    "relative h-6 w-11 rounded-full transition-colors focus:outline-none",
                    settings.notifications[n.id as keyof typeof settings.notifications] ? "bg-emerald-500" : "bg-zinc-800"
                  )}
                >
                  <div className={cn(
                    "absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform",
                    settings.notifications[n.id as keyof typeof settings.notifications] ? "translate-x-5" : "translate-x-0"
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
                This uses a small script in your MetaTrader that pushes trades to your journal for free.
              </p>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <p className="text-[10px] font-bold uppercase text-emerald-500 mb-1">Your Unique Webhook URL:</p>
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
                    <span>Install the <strong>JournalSync EA</strong> (code provided in chat)</span>
                  </li>
                </ul>
              </div>
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
