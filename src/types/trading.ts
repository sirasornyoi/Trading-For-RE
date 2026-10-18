export type AssetCategory = 'crypto' | 'commodity' | 'stock';

export interface Asset {
  symbol: string;
  name: string;
  thaiName: string;
  category: AssetCategory;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: string;
  decimals: number;
  unit: string;
  icon: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export type ChartType = 'candles' | 'line';

export interface IndicatorSettings {
  showEMA20: boolean;
  showEMA50: boolean;
  showBollinger: boolean;
  showRSI: boolean;
  showMACD: boolean;
  showVolume: boolean;
}

export interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice: number;
  condition: 'gte' | 'lte'; // gte: price >= target, lte: price <= target
  initialPrice: number;
  createdAt: number;
  triggeredAt?: number;
  status: 'active' | 'triggered' | 'disabled';
  note?: string;
  soundEnabled: boolean;
  recurring: boolean;
}

export interface OrderBookEntry {
  price: number;
  amount: number;
  total: number;
  percent: number;
}

export interface TradeTick {
  id: string;
  price: number;
  amount: number;
  time: number;
  side: 'buy' | 'sell';
}

export interface Position {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  amount: number;
  margin: number;
  leverage: number;
  takeProfit?: number;
  stopLoss?: number;
  openedAt: number;
  pnl: number;
  pnlPercent: number;
}

export interface PaperAccount {
  balance: number;
  equity: number;
  marginUsed: number;
  freeMargin: number;
  realizedPnl: number;
}
