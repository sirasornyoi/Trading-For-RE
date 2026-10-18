import { Asset, Candle, Timeframe } from '../types/trading';

export const INITIAL_ASSETS: Asset[] = [
  {
    symbol: 'BTC/USDT',
    name: 'Bitcoin',
    thaiName: 'บิตคอยน์',
    category: 'crypto',
    price: 67845.50,
    change24h: 3.42,
    high24h: 68420.00,
    low24h: 65110.00,
    volume24h: '4.28B',
    decimals: 2,
    unit: 'USDT',
    icon: '₿',
  },
  {
    symbol: 'ETH/USDT',
    name: 'Ethereum',
    thaiName: 'อีเธอเรียม',
    category: 'crypto',
    price: 2645.20,
    change24h: 2.15,
    high24h: 2690.00,
    low24h: 2560.50,
    volume24h: '1.92B',
    decimals: 2,
    unit: 'USDT',
    icon: 'Ξ',
  },
  {
    symbol: 'SOL/USDT',
    name: 'Solana',
    thaiName: 'โซลานา',
    category: 'crypto',
    price: 156.80,
    change24h: 5.84,
    high24h: 159.90,
    low24h: 147.20,
    volume24h: '850M',
    decimals: 2,
    unit: 'USDT',
    icon: '◎',
  },
  {
    symbol: 'XAU/USD',
    name: 'Gold Spot',
    thaiName: 'ทองคำสปอต',
    category: 'commodity',
    price: 2724.85,
    change24h: 0.88,
    high24h: 2736.20,
    low24h: 2708.40,
    volume24h: '3.15B',
    decimals: 2,
    unit: 'USD/oz',
    icon: '🥇',
  },
  {
    symbol: 'XAG/USD',
    name: 'Silver Spot',
    thaiName: 'โลหะเงิน',
    category: 'commodity',
    price: 32.14,
    change24h: 1.76,
    high24h: 32.48,
    low24h: 31.40,
    volume24h: '680M',
    decimals: 2,
    unit: 'USD/oz',
    icon: '🥈',
  },
  {
    symbol: 'WTI/USD',
    name: 'Crude Oil',
    thaiName: 'น้ำมันดิบ WTI',
    category: 'commodity',
    price: 70.45,
    change24h: -1.25,
    high24h: 72.10,
    low24h: 69.80,
    volume24h: '1.4B',
    decimals: 2,
    unit: 'USD/bbl',
    icon: '🛢️',
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corp',
    thaiName: 'เอ็นวิเดีย',
    category: 'stock',
    price: 139.50,
    change24h: 3.12,
    high24h: 141.20,
    low24h: 135.80,
    volume24h: '52.4M',
    decimals: 2,
    unit: 'USD',
    icon: '🟢',
  },
  {
    symbol: 'TSLA',
    name: 'Tesla Inc',
    thaiName: 'เทสลา',
    category: 'stock',
    price: 221.30,
    change24h: -2.45,
    high24h: 228.00,
    low24h: 218.60,
    volume24h: '38.2M',
    decimals: 2,
    unit: 'USD',
    icon: '⚡',
  },
  {
    symbol: 'AAPL',
    name: 'Apple Inc',
    thaiName: 'แอปเปิ้ล',
    category: 'stock',
    price: 235.80,
    change24h: 0.65,
    high24h: 237.40,
    low24h: 233.90,
    volume24h: '28.1M',
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

// Generate realistic candlestick history for any asset and timeframe
export function generateCandleHistory(basePrice: number, timeframe: Timeframe, count: number = 80): Candle[] {
  const stepSeconds = TIMEFRAME_SECONDS[timeframe];
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - (count * stepSeconds);

  const candles: Candle[] = [];
  let currentPrice = basePrice * (1 - (Math.random() * 0.05 - 0.025));

  // Volatility scale factor based on asset price magnitude
  const volFactor = basePrice < 100 ? 0.003 : basePrice < 1000 ? 0.0025 : 0.002;

  for (let i = 0; i < count; i++) {
    const time = startTime + (i * stepSeconds);
    const trend = Math.sin(i / 10) * 0.001; // subtle wave
    const change = (Math.random() - 0.49 + trend) * volFactor * currentPrice;
    
    const open = currentPrice;
    const close = Math.max(0.01, open + change);
    const highWick = Math.random() * volFactor * currentPrice * 1.5;
    const lowWick = Math.random() * volFactor * currentPrice * 1.5;
    
    const high = Math.max(open, close) + highWick;
    const low = Math.min(open, close) - lowWick;
    const volume = Math.floor(Math.random() * 500 + 100) * (basePrice > 10000 ? 0.2 : basePrice > 1000 ? 2 : 20);

    candles.push({
      time,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Number(volume.toFixed(1)),
    });

    currentPrice = close;
  }

  return candles;
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
