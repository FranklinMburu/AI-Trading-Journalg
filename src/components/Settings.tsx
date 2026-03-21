import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, addDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { UserSettings } from '../types';
import { Settings as SettingsIcon, Save, Bell, Target, DollarSign, Globe, Shield } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Settings({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({
    userId,
    currency: 'USD',
    dailyGoal: 500,
    weeklyGoal: 2500,
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
      console.error('Error saving settings:', error);
      alert('Failed to save settings.');
    } finally {
      setSaving(false);
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
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save size={18} />}
          Save Changes
        </button>
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
              <label key={n.id} className="flex cursor-pointer items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 hover:border-zinc-700">
                <div>
                  <p className="text-sm font-bold">{n.label}</p>
                  <p className="text-xs text-zinc-500">{n.desc}</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.notifications[n.id as keyof typeof settings.notifications]}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, [n.id]: e.target.checked }
                  })}
                  className="h-5 w-5 rounded border-zinc-800 bg-zinc-900 text-blue-600 focus:ring-blue-500"
                />
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
