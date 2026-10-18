export type AssetCategory = 'crypto' | 'commodity' | 'stock';

export interface Asset {
  symbol: string;
  name: string;
  thaiName: string;
  category: AssetCategory;
  decimals: number;
  unit: string;
  icon: string;
  price?: number;
  changeVsPrevCandle?: number;
  change24h?: number;
  high24h?: number;
  low24h?: number;
  volume24h?: string;
  lastCandleDate?: string;
  dataSource?: 'Binance' | 'CSV Upload' | null;
  csvTimeframe?: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

export type ChartType = 'candles' | 'line';

export interface IndicatorSettings {
  showEMA20: boolean;
  showEMA50: boolean;
  showEMA100: boolean;
  showEMA200: boolean;
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
  initialPrice?: number;
  createdAt: number;
  triggeredAt?: number;
  status: 'active' | 'triggered' | 'disabled';
  note?: string;
  soundEnabled: boolean;
  recurring: boolean;
  armed?: boolean;
}
