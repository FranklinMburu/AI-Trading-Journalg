import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Trade } from '../types';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  isToday
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';

export default function Calendar({ userId }: { userId: string }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'trades'),
      where('userId', '==', userId),
      where('status', '==', 'CLOSED')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trade)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trades');
    });

    return () => unsubscribe();
  }, [userId]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const getDayTrades = (day: Date) => {
    return trades.filter(trade => {
      const tradeDate = new Date(trade.exitTime || trade.entryTime);
      return isSameDay(tradeDate, day);
    });
  };

  const getDayPnL = (day: Date) => {
    const dayTrades = getDayTrades(day);
    return dayTrades.reduce((acc, trade) => acc + (trade.pnl || 0), 0);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  const monthPnL = trades
    .filter(t => isSameMonth(new Date(t.exitTime || t.entryTime), currentDate))
    .reduce((acc, t) => acc + (t.pnl || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
            <CalendarIcon size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold">Trading Calendar</h3>
            <p className="text-sm text-zinc-400">Track your daily performance</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Month PnL</span>
            <span className={cn(
              "font-bold",
              monthPnL >= 0 ? "text-emerald-500" : "text-rose-500"
            )}>
              {formatCurrency(monthPnL)}
            </span>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-1">
            <button 
              onClick={prevMonth}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="px-4 text-sm font-bold min-w-[140px] text-center">
              {format(currentDate, 'MMMM yyyy')}
            </span>
            <button 
              onClick={nextMonth}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30 shadow-sm">
        <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-900/50">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="py-3 text-center text-xs font-bold uppercase tracking-widest text-zinc-500">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {calendarDays.map((day, idx) => {
            const dayPnL = getDayPnL(day);
            const dayTrades = getDayTrades(day);
            const isCurrentMonth = isSameMonth(day, monthStart);
            
            return (
              <div 
                key={day.toString()} 
                className={cn(
                  "relative min-h-[120px] border-b border-r border-zinc-800 p-2 transition-colors hover:bg-zinc-800/20",
                  !isCurrentMonth && "bg-zinc-950/50 opacity-30",
                  idx % 7 === 6 && "border-r-0"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium",
                    isToday(day) ? "bg-emerald-500 text-zinc-950 font-bold" : "text-zinc-400"
                  )}>
                    {format(day, 'd')}
                  </span>
                  {dayPnL !== 0 && isCurrentMonth && (
                    <span className={cn(
                      "text-[10px] font-bold",
                      dayPnL > 0 ? "text-emerald-500" : "text-rose-500"
                    )}>
                      {dayPnL > 0 ? '+' : ''}{formatCurrency(dayPnL)}
                    </span>
                  )}
                </div>

                <div className="mt-2 space-y-1">
                  {dayTrades.slice(0, 3).map(trade => (
                    <div 
                      key={trade.id} 
                      className={cn(
                        "flex items-center justify-between rounded px-1.5 py-0.5 text-[10px] font-medium",
                        (trade.pnl || 0) > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                      )}
                    >
                      <span className="truncate">{trade.symbol}</span>
                      <span>{trade.pnl ? (trade.pnl > 0 ? '+' : '') + Math.round(trade.pnl) : ''}</span>
                    </div>
                  ))}
                  {dayTrades.length > 3 && (
                    <div className="text-center text-[9px] text-zinc-500 font-medium">
                      +{dayTrades.length - 3} more
                    </div>
                  )}
                </div>

                {/* Background indicator for profitable/losing days */}
                {dayPnL !== 0 && isCurrentMonth && (
                  <div className={cn(
                    "absolute inset-x-0 bottom-0 h-1",
                    dayPnL > 0 ? "bg-emerald-500/20" : "bg-rose-500/20"
                  )} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend & Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="mb-2 flex items-center gap-2 text-emerald-500">
            <TrendingUp size={16} />
            <span className="text-xs font-bold uppercase tracking-wider">Best Day</span>
          </div>
          <p className="text-lg font-bold">
            {formatCurrency(Math.max(...trades.map(t => t.pnl || 0), 0))}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="mb-2 flex items-center gap-2 text-rose-500">
            <TrendingDown size={16} />
            <span className="text-xs font-bold uppercase tracking-wider">Worst Day</span>
          </div>
          <p className="text-lg font-bold">
            {formatCurrency(Math.min(...trades.map(t => t.pnl || 0), 0))}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="mb-2 flex items-center gap-2 text-blue-500">
            <CalendarIcon size={16} />
            <span className="text-xs font-bold uppercase tracking-wider">Trading Days</span>
          </div>
          <p className="text-lg font-bold">
            {new Set(trades.map(t => format(new Date(t.exitTime || t.entryTime), 'yyyy-MM-dd'))).size}
          </p>
        </div>
      </div>
    </div>
  );
}
