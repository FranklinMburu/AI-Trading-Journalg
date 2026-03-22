import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { generateContent, getCache, setCache, isCacheValid, AI_MODELS } from '../services/aiService';
import { Globe, AlertTriangle, Clock, Info, RefreshCw, Calendar as CalendarIcon, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/utils';
import { format, isAfter, isBefore, addMinutes, subMinutes } from 'date-fns';

interface EconomicEvent {
  time: string;
  currency: string;
  event: string;
  impact: 'High' | 'Medium' | 'Low';
  actual?: string;
  forecast?: string;
  previous?: string;
}

export default function EconomicCalendar({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = async () => {
    const cacheKey = `economic_calendar_${userId}`;
    const cached = getCache(cacheKey);

    if (isCacheValid(cached, 6 * 60 * 60 * 1000)) {
      setEvents(cached?.data || []);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await generateContent({
        model: AI_MODELS.FLASH,
        contents: `Fetch the high and medium impact economic events for the current week (starting from ${new Date().toLocaleDateString()}). 
        Focus on major currencies (USD, EUR, GBP, JPY, AUD, CAD). 
        Return the data as a JSON array of objects with fields: time (ISO string), currency, event, impact (High/Medium/Low), forecast, previous.`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                time: { type: Type.STRING },
                currency: { type: Type.STRING },
                event: { type: Type.STRING },
                impact: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] },
                forecast: { type: Type.STRING },
                previous: { type: Type.STRING }
              },
              required: ['time', 'currency', 'event', 'impact']
            }
          }
        },
      });

      const data = JSON.parse(response.text);
      const sortedData = data.sort((a: EconomicEvent, b: EconomicEvent) => new Date(a.time).getTime() - new Date(b.time).getTime());
      setEvents(sortedData);
      setCache(cacheKey, sortedData);
    } catch (err) {
      console.error('Error fetching economic events:', err);
      setError('Failed to fetch economic calendar. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const isNoTradeZone = (eventTime: string) => {
    const now = new Date();
    const eventDate = new Date(eventTime);
    const startZone = subMinutes(eventDate, 30);
    const endZone = addMinutes(eventDate, 30);
    return isAfter(now, startZone) && isBefore(now, endZone);
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'High': return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
      case 'Medium': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
      default: return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
            <Globe size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold">Economic Calendar</h3>
            <p className="text-sm text-zinc-400">High-impact events and no-trade zones</p>
          </div>
        </div>
        <button 
          onClick={fetchEvents}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
        >
          <RefreshCw size={16} className={cn(loading && "animate-spin")} />
          Refresh Calendar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-rose-500">
          <AlertTriangle size={20} />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="grid gap-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-zinc-400 animate-pulse">Fetching latest economic data...</p>
          </div>
        ) : events.length > 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden backdrop-blur-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50 text-xs font-medium uppercase tracking-wider text-zinc-500">
                    <th className="px-6 py-4">Time</th>
                    <th className="px-6 py-4">Currency</th>
                    <th className="px-6 py-4">Event</th>
                    <th className="px-6 py-4">Impact</th>
                    <th className="px-6 py-4">Forecast / Prev</th>
                    <th className="px-6 py-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {events.map((event, i) => {
                    const activeZone = isNoTradeZone(event.time);
                    const eventDate = new Date(event.time);
                    const isPast = isBefore(eventDate, new Date());

                    return (
                      <tr key={i} className={cn(
                        "group transition-colors",
                        activeZone ? "bg-rose-500/5" : "hover:bg-zinc-800/30",
                        isPast && "opacity-50"
                      )}>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-zinc-100">
                              {format(eventDate, 'HH:mm')}
                            </span>
                            <span className="text-[10px] text-zinc-500">
                              {format(eventDate, 'MMM d, yyyy')}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="rounded bg-zinc-800 px-2 py-1 text-xs font-bold text-zinc-300">
                            {event.currency}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-zinc-200">{event.event}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase",
                            getImpactColor(event.impact)
                          )}>
                            {event.impact}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-4 text-xs text-zinc-400">
                            <span>F: {event.forecast || '-'}</span>
                            <span>P: {event.previous || '-'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {activeZone ? (
                            <div className="flex items-center justify-end gap-1.5 text-rose-500 animate-pulse">
                              <ShieldAlert size={14} />
                              <span className="text-[10px] font-bold uppercase">No-Trade Zone</span>
                            </div>
                          ) : isPast ? (
                            <span className="text-[10px] font-bold uppercase text-zinc-600">Completed</span>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5 text-emerald-500">
                              <Clock size={14} />
                              <span className="text-[10px] font-bold uppercase">Upcoming</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <CalendarIcon size={48} className="mb-4 opacity-20" />
            <p>No economic events found for this week.</p>
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
        <div className="flex gap-4">
          <div className="rounded-xl bg-blue-500/10 p-2 text-blue-500">
            <Info size={20} />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-blue-500 uppercase tracking-wider">About No-Trade Zones</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              No-Trade Zones are flagged 30 minutes before and after high-impact economic events. 
              During these times, market volatility can spike significantly, leading to slippage and unpredictable price action. 
              Professional traders often avoid entering new positions during these windows to protect their capital.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
