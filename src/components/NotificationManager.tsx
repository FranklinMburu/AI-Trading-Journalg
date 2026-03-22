import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Trade, UserSettings } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCircle2, XCircle, Trophy, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface Notification {
  id: string;
  type: 'TP' | 'SL' | 'GOAL';
  title: string;
  message: string;
  timestamp: number;
}

export default function NotificationManager({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [lastProcessedTradeId, setLastProcessedTradeId] = useState<string | null>(null);

  useEffect(() => {
    const settingsQuery = query(collection(db, 'settings'), where('userId', '==', userId));
    const unsubscribeSettings = onSnapshot(settingsQuery, (snapshot) => {
      if (!snapshot.empty) setSettings(snapshot.docs[0].data() as UserSettings);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'settings');
    });

    const tradesQuery = query(
      collection(db, 'trades'),
      where('userId', '==', userId),
      where('status', '==', 'CLOSED'),
      orderBy('exitTime', 'desc'),
      limit(1)
    );

    const unsubscribeTrades = onSnapshot(tradesQuery, (snapshot) => {
      if (snapshot.empty || !settings) return;

      const latestTrade = snapshot.docs[0].data() as Trade;
      const tradeId = snapshot.docs[0].id;

      // Only process if it's a new trade closure
      if (tradeId !== lastProcessedTradeId) {
        setLastProcessedTradeId(tradeId);

        const pnl = latestTrade.pnl || 0;
        const isWin = pnl > 0;

        if (isWin && settings.notifications.tp_hit) {
          addNotification({
            type: 'TP',
            title: 'Take Profit Hit! 🎯',
            message: `Closed ${latestTrade.symbol} for a profit of ${settings.currency} ${pnl.toFixed(2)}`,
          });
        } else if (!isWin && settings.notifications.sl_hit) {
          addNotification({
            type: 'SL',
            title: 'Stop Loss Hit 🛑',
            message: `Closed ${latestTrade.symbol} with a loss of ${settings.currency} ${Math.abs(pnl).toFixed(2)}`,
          });
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trades');
    });

    return () => {
      unsubscribeSettings();
      unsubscribeTrades();
    };
  }, [userId, settings, lastProcessedTradeId]);

  const addNotification = (notif: Omit<Notification, 'id' | 'timestamp'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNotif = { ...notif, id, timestamp: Date.now() };
    setNotifications(prev => [newNotif, ...prev]);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      removeNotification(id);
    }, 5000);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            className={cn(
              "pointer-events-auto flex w-80 items-start gap-4 rounded-2xl border p-4 shadow-2xl backdrop-blur-xl",
              n.type === 'TP' && "border-emerald-500/20 bg-emerald-500/10",
              n.type === 'SL' && "border-rose-500/20 bg-rose-500/10",
              n.type === 'GOAL' && "border-purple-500/20 bg-purple-500/10"
            )}
          >
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              n.type === 'TP' && "bg-emerald-500 text-zinc-950",
              n.type === 'SL' && "bg-rose-500 text-white",
              n.type === 'GOAL' && "bg-purple-500 text-white"
            )}>
              {n.type === 'TP' && <CheckCircle2 size={20} />}
              {n.type === 'SL' && <XCircle size={20} />}
              {n.type === 'GOAL' && <Trophy size={20} />}
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold">{n.title}</h4>
              <p className="text-xs text-zinc-400 leading-relaxed mt-0.5">{n.message}</p>
            </div>
            <button 
              onClick={() => removeNotification(n.id)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
