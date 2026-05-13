export type TradeDirection = 'LONG' | 'SHORT';
export type TradeStatus = 'OPEN' | 'CLOSED';

export interface Trade {
  id?: string;
  userId: string;
  accountId: string;
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
  isDemo?: boolean;
}

export interface UserSettings {
  userId: string;
  currency: string;
  dailyGoal: number;
  weeklyGoal: number;
  startingBalance?: number;
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
  webhookSecret?: string;
}

export interface JournalEntry {
  id?: string;
  userId: string;
  accountId?: string;
  tradeId?: string;
  content: string;
  timestamp: string;
  mood?: string;
  tags?: string[];
  isDemo?: boolean;
}

export interface Strategy {
  id?: string;
  userId: string;
  name: string;
  description?: string;
  rules?: string;
  notes?: string;
  createdAt?: string;
  isDemo?: boolean;
}

export interface EquityPoint {
  time: string;
  value: number;
}

export interface TradingAccount {
  id?: string;
  userId: string;
  accountNumber: string;
  name: string;
  broker?: string;
  currency: string;
  balance: number;
  equity?: number;
  lastSync?: string;
  type?: string;
  createdAt: string;
  lastUpdate: string;
}

export interface UserStats {
  userId: string;
  totalProfit: number;
  winRate: number;
  totalTrades: number;
  equityCurve: EquityPoint[];
}
