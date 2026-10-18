import { Asset, Candle, Timeframe } from '../types/trading';

export const INITIAL_ASSETS: Asset[] = [
  {
    symbol: 'BTC/USDT',
    name: 'Bitcoin',
    thaiName: 'บิตคอยน์',
    category: 'crypto',
    decimals: 2,
    unit: 'USDT',
    icon: '₿',
  },
  {
    symbol: 'ETH/USDT',
    name: 'Ethereum',
    thaiName: 'อีเธอเรียม',
    category: 'crypto',
    decimals: 2,
    unit: 'USDT',
    icon: 'Ξ',
  },
  {
    symbol: 'SOL/USDT',
    name: 'Solana',
    thaiName: 'โซลานา',
    category: 'crypto',
    decimals: 2,
    unit: 'USDT',
    icon: '◎',
  },
  {
    symbol: 'SI1!',
    name: 'Silver Futures',
    thaiName: 'ซิลเวอร์ฟิวเจอร์ส (COMEX)',
    category: 'commodity',
    decimals: 3,
    unit: 'USD/oz',
    icon: '🥈',
  },
  {
    symbol: 'XAU/USD',
    name: 'Gold Spot',
    thaiName: 'ทองคำสปอต',
    category: 'commodity',
    decimals: 2,
    unit: 'USD/oz',
    icon: '🥇',
  },
  {
    symbol: 'XAG/USD',
    name: 'Silver Spot',
    thaiName: 'โลหะเงิน',
    category: 'commodity',
    decimals: 2,
    unit: 'USD/oz',
    icon: '🥈',
  },
  {
    symbol: 'WTI/USD',
    name: 'Crude Oil',
    thaiName: 'น้ำมันดิบ WTI',
    category: 'commodity',
    decimals: 2,
    unit: 'USD/bbl',
    icon: '🛢️',
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corp',
    thaiName: 'เอ็นวิเดีย',
    category: 'stock',
    decimals: 2,
    unit: 'USD',
    icon: '🟢',
  },
  {
    symbol: 'TSLA',
    name: 'Tesla Inc',
    thaiName: 'เทสลา',
    category: 'stock',
    decimals: 2,
    unit: 'USD',
    icon: '⚡',
  },
  {
    symbol: 'AAPL',
    name: 'Apple Inc',
    thaiName: 'แอปเปิ้ล',
    category: 'stock',
    decimals: 2,
    unit: 'USD',
    icon: '🍎',
  },
];

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

// Fetch real historical klines from Binance REST API
export async function fetchBinanceKlines(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  const cleanSymbol = symbol.replace('/', '').toUpperCase();
  const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${cleanSymbol}&interval=${timeframe}&limit=100`);
  if (!res.ok) {
    throw new Error(`Failed to fetch Binance klines: ${res.statusText}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map((item: (number | string)[]) => ({
    time: Math.floor(Number(item[0]) / 1000),
    open: parseFloat(item[1] as string),
    high: parseFloat(item[2] as string),
    low: parseFloat(item[3] as string),
    close: parseFloat(item[4] as string),
    volume: parseFloat(item[5] as string) || 0,
  }));
}

// Parse TradingView CSV export (case-insensitive column matching: time, open, high, low, close, volume)
export function parseTradingViewCSV(csvText: string): Candle[] {
  const lines = csvText.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = headerLine.split(',').map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));

  const timeIdx = headers.findIndex(h => h === 'time' || h === 'date' || h === 'datetime');
  const openIdx = headers.findIndex(h => h === 'open');
  const highIdx = headers.findIndex(h => h === 'high');
  const lowIdx = headers.findIndex(h => h === 'low');
  const closeIdx = headers.findIndex(h => h === 'close');
  const volIdx = headers.findIndex(h => h === 'volume' || h === 'vol');

  if (timeIdx === -1 || openIdx === -1 || highIdx === -1 || lowIdx === -1 || closeIdx === -1) {
    throw new Error('CSV must contain time, open, high, low, close columns');
  }

  const candles: Candle[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (row.length <= Math.max(timeIdx, openIdx, highIdx, lowIdx, closeIdx)) continue;

    const rawTime = row[timeIdx];
    let timestamp = 0;

    const numTime = Number(rawTime);
    if (!isNaN(numTime) && numTime > 0) {
      timestamp = numTime > 10000000000 ? Math.floor(numTime / 1000) : Math.floor(numTime);
    } else {
      const parsedDate = new Date(rawTime).getTime();
      if (!isNaN(parsedDate)) {
        timestamp = Math.floor(parsedDate / 1000);
      }
    }

    if (timestamp === 0) continue;

    const open = parseFloat(row[openIdx]);
    const high = parseFloat(row[highIdx]);
    const low = parseFloat(row[lowIdx]);
    const close = parseFloat(row[closeIdx]);
    const volume = volIdx !== -1 && row[volIdx] ? parseFloat(row[volIdx]) : 0;

    if (!isNaN(open) && !isNaN(high) && !isNaN(low) && !isNaN(close)) {
      candles.push({
        time: timestamp,
        open,
        high,
        low,
        close,
        volume: isNaN(volume) ? 0 : volume,
      });
    }
  }

  // Sort ascending by time
  candles.sort((a, b) => a.time - b.time);
  return candles;
}

// LocalStorage helpers for stored CSV candles per asset
export function getStoredCandles(symbol: string): Candle[] {
  try {
    const raw = localStorage.getItem(`candles_${symbol}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function setStoredCandles(symbol: string, candles: Candle[]): void {
  try {
    localStorage.setItem(`candles_${symbol}`, JSON.stringify(candles));
  } catch {}
}

export function detectCandleTimeframe(candles: Candle[]): string {
  if (candles.length < 2) return '1D';
  const diffs: number[] = [];
  const limit = Math.min(25, candles.length);
  for (let i = 1; i < limit; i++) {
    const diff = Math.abs(candles[i].time - candles[i - 1].time);
    if (diff > 0) diffs.push(diff);
  }
  if (diffs.length === 0) return '1D';
  diffs.sort((a, b) => a - b);
  const median = diffs[Math.floor(diffs.length / 2)];

  if (median <= 90) return '1m';
  if (median <= 210) return '3m';
  if (median <= 450) return '5m';
  if (median <= 1200) return '15m';
  if (median <= 2700) return '30m';
  if (median <= 5400) return '1h';
  if (median <= 10800) return '2h';
  if (median <= 21600) return '4h';
  if (median <= 43200) return '8h';
  if (median <= 120000) return '1D';
  if (median <= 700000) return '1W';
  return '1M';
}

// Indicator math: Exponential Moving Average
export function calculateEMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  let ema: number | null = null;

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    if (ema === null) {
      // First EMA is simple SMA
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j];
      }
      ema = sum / period;
    } else {
      ema = data[i] * k + ema * (1 - k);
    }
    result.push(ema);
  }

  return result;
}

// Indicator math: Bollinger Bands (Upper, Middle, Lower)
export function calculateBollingerBands(data: number[], period: number = 20, multiplier: number = 2) {
  const upper: (number | null)[] = [];
  const middle: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      middle.push(null);
      lower.push(null);
      continue;
    }

    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j];
    }
    const sma = sum / period;

    let varianceSum = 0;
    for (let j = 0; j < period; j++) {
      varianceSum += Math.pow(data[i - j] - sma, 2);
    }
    const stdDev = Math.sqrt(varianceSum / period);

    middle.push(sma);
    upper.push(sma + (multiplier * stdDev));
    lower.push(sma - (multiplier * stdDev));
  }

  return { upper, middle, lower };
}

// Indicator math: Relative Strength Index (RSI 14)
export function calculateRSI(closes: number[], period: number = 14): (number | null)[] {
  const rsi: (number | null)[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      rsi.push(null);
      continue;
    }

    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    if (i < period) {
      gains += gain;
      losses += loss;
      rsi.push(null);
      continue;
    }

    if (i === period) {
      gains = (gains + gain) / period;
      losses = (losses + loss) / period;
    } else {
      gains = (gains * (period - 1) + gain) / period;
      losses = (losses * (period - 1) + loss) / period;
    }

    if (losses === 0) {
      rsi.push(100);
    } else {
      const rs = gains / losses;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }

  return rsi;
}

// Indicator math: MACD (12, 26, 9)
export function calculateMACD(closes: number[]) {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine: (number | null)[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] !== null && ema26[i] !== null) {
      macdLine.push(ema12[i]! - ema26[i]!);
    } else {
      macdLine.push(null);
    }
  }

  // Calculate signal line (9-period EMA of MACD)
  const validMacdValues: number[] = [];
  const validIndices: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null) {
      validMacdValues.push(macdLine[i]!);
      validIndices.push(i);
    }
  }

  const signalLineValid = calculateEMA(validMacdValues, 9);
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  const histogram: (number | null)[] = new Array(closes.length).fill(null);

  for (let j = 0; j < validIndices.length; j++) {
    const originalIdx = validIndices[j];
    signalLine[originalIdx] = signalLineValid[j];
    if (macdLine[originalIdx] !== null && signalLine[originalIdx] !== null) {
      histogram[originalIdx] = macdLine[originalIdx]! - signalLine[originalIdx]!;
    }
  }

  return { macdLine, signalLine, histogram };
}
