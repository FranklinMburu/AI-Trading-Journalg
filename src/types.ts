export type TradeDirection = 'LONG' | 'SHORT';
export type TradeStatus = 'OPEN' | 'CLOSED';

export interface Trade {
  id?: string;
  userId: string;
  symbol: string;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  direction: TradeDirection;
  status: TradeStatus;
  pnl?: number;
  entryTime: string;
  exitTime?: string;
  stopLoss?: number;
  takeProfit?: number;
  notes?: string;
  strategyId?: string;
  tags?: string[];
}

export interface UserSettings {
  userId: string;
  currency: string;
  dailyGoal: number;
  weeklyGoal: number;
  notifications: {
    tp_hit: boolean;
    sl_hit: boolean;
    goal_reached: boolean;
    daily_summary: boolean;
  };
  brokerConfig?: {
    provider: 'metaapi';
    metaApiToken: string;
    accountId: string;
    isActive: boolean;
  };
}

export interface JournalEntry {
  id?: string;
  userId: string;
  tradeId?: string;
  content: string;
  timestamp: string;
  mood?: string;
  tags?: string[];
}

export interface Strategy {
  id?: string;
  userId: string;
  name: string;
  description?: string;
  rules?: string;
  notes?: string;
  createdAt?: string;
}

export interface EquityPoint {
  time: string;
  value: number;
}

export interface UserStats {
  userId: string;
  totalProfit: number;
  winRate: number;
  totalTrades: number;
  equityCurve: EquityPoint[];
}
