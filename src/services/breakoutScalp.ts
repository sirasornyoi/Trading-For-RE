import { Candle } from '../types/trading';

export type ScalpTimeframe = '1m' | '5m';
export type FundDirection = 'up' | 'down' | 'unclear';
export type SetupType = 'Trend' | 'Impulse' | 'Rebound';
export type EntryMode = 'immediate' | 'retest';
export type StopMode = 'beyond_line' | 'candle_extreme';
export type ScalpSide = 'bull' | 'bear';

export interface BreakoutScalpAssetConfig {
  symbol: string;
  name: string;
  thaiName: string;
  source: 'Binance' | 'Yahoo';
  decimals: number;
  timeframe: ScalpTimeframe;
  levelHigh: number | null;
  levelHighSetAt: number | null;
  levelLow: number | null;
  levelLowSetAt: number | null;
  fundDirection: FundDirection;
  setup: SetupType;
  targetBull: number | null;
  targetBear: number | null;
  buffer: number;
  entryMode: EntryMode;
  stopMode: StopMode;
  hasClearNarrative: boolean;
  isEventFirstCandle: boolean;
  alertEnabled: boolean;
}

export const SCALP_ASSETS: { symbol: string; name: string; thaiName: string; source: 'Binance' | 'Yahoo'; decimals: number; defaultBuffer: number }[] = [
  { symbol: 'XAU/USD', name: 'Gold Spot', thaiName: 'ทองคำสปอต (COMEX)', source: 'Yahoo', decimals: 2, defaultBuffer: 0.5 },
  { symbol: 'XAG/USD', name: 'Silver Spot', thaiName: 'โลหะเงิน (COMEX)', source: 'Yahoo', decimals: 3, defaultBuffer: 0.05 },
  { symbol: 'BTC/USDT', name: 'Bitcoin', thaiName: 'บิตคอยน์', source: 'Binance', decimals: 2, defaultBuffer: 5 },
  { symbol: 'ETH/USDT', name: 'Ethereum', thaiName: 'อีเธอเรียม', source: 'Binance', decimals: 2, defaultBuffer: 0.5 },
  { symbol: 'SOL/USDT', name: 'Solana', thaiName: 'โซลานา', source: 'Binance', decimals: 2, defaultBuffer: 0.1 },
];

export const SCALP_STORAGE_KEY = 'apextrade_breakout_scalp_configs_v1';

export function getDefaultScalpConfigs(): Record<string, BreakoutScalpAssetConfig> {
  const configs: Record<string, BreakoutScalpAssetConfig> = {};
  for (const asset of SCALP_ASSETS) {
    configs[asset.symbol] = {
      symbol: asset.symbol,
      name: asset.name,
      thaiName: asset.thaiName,
      source: asset.source,
      decimals: asset.decimals,
      timeframe: '5m',
      levelHigh: null,
      levelHighSetAt: null,
      levelLow: null,
      levelLowSetAt: null,
      fundDirection: 'unclear',
      setup: 'Trend',
      targetBull: null,
      targetBear: null,
      buffer: asset.defaultBuffer,
      entryMode: 'immediate',
      stopMode: 'candle_extreme',
      hasClearNarrative: false,
      isEventFirstCandle: false,
      alertEnabled: false,
    };
  }
  return configs;
}

export function loadScalpConfigs(): Record<string, BreakoutScalpAssetConfig> {
  try {
    const raw = localStorage.getItem(SCALP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const defaults = getDefaultScalpConfigs();
      return { ...defaults, ...parsed };
    }
  } catch {}
  return getDefaultScalpConfigs();
}

export function saveScalpConfigs(configs: Record<string, BreakoutScalpAssetConfig>): void {
  try {
    localStorage.setItem(SCALP_STORAGE_KEY, JSON.stringify(configs));
  } catch {}
}

// Indicator math helpers
export function calculateATR(candles: Candle[], period: number = 14): number[] {
  if (candles.length === 0) return [];
  const trArr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hpc = Math.abs(candles[i].high - candles[i - 1].close);
    const lpc = Math.abs(candles[i].low - candles[i - 1].close);
    trArr.push(Math.max(hl, hpc, lpc));
  }

  const atr: number[] = [];
  let sum = 0;
  for (let i = 0; i < trArr.length; i++) {
    sum += trArr[i];
    if (i >= period) {
      sum -= trArr[i - period];
      atr.push(sum / period);
    } else if (i === period - 1) {
      atr.push(sum / period);
    } else {
      atr.push(sum / (i + 1));
    }
  }
  return atr;
}

export function calculateEMAValues(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let prev = values[0];
  ema.push(prev);
  for (let i = 1; i < values.length; i++) {
    const current = values[i] * k + prev * (1 - k);
    ema.push(current);
    prev = current;
  }
  return ema;
}

export function calculateRSIValues(closes: number[], period: number = 14): number[] {
  if (closes.length <= period) return [];
  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const currentRSI = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    rsi.push(currentRSI);
  }
  return rsi;
}

// Aggregate 1-hour candles into 4-hour candles
export function aggregate1hTo4h(h1Candles: Candle[]): Candle[] {
  if (h1Candles.length === 0) return [];
  const map = new Map<number, Candle[]>();
  for (const c of h1Candles) {
    // 4 hours in seconds = 14400
    const blockTime = Math.floor(c.time / 14400) * 14400;
    const list = map.get(blockTime) || [];
    list.push(c);
    map.set(blockTime, list);
  }

  const result: Candle[] = [];
  for (const [blockTime, group] of map.entries()) {
    if (group.length === 0) continue;
    group.sort((a, b) => a.time - b.time);
    const open = group[0].open;
    const close = group[group.length - 1].close;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    for (const c of group) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      volume += c.volume || 0;
    }
    result.push({
      time: blockTime,
      open,
      high,
      low,
      close,
      volume,
    });
  }
  return result.sort((a, b) => a.time - b.time);
}

// Filter to closed candles only
export function filterClosedCandles(candles: Candle[], tfSeconds: number): Candle[] {
  const nowSec = Math.floor(Date.now() / 1000);
  return candles.filter(c => c.time + tfSeconds <= nowSec);
}

export interface ChecklistItemResult {
  step: number;
  title: string;
  fact: string;
  inference: string;
  status: 'pass' | 'fail' | 'warn' | 'unknown' | 'info'; // ✅ ❌ ⚠️ ❓ ℹ️
}

export interface TriggerEvaluation {
  triggerIndex: number;
  triggerCandle: Candle;
  barsAgo: number;
  volumeRatio: number;
  isShortCoveringWarning: boolean;
}

export interface ScalpChecklistResult {
  side: ScalpSide;
  level: number | null;
  trigger: TriggerEvaluation | null;
  items: ChecklistItemResult[];
  entryPrice: number | null;
  stopPrice: number | null;
  riskAmount: number | null;
  target3R: number | null;
  actualRR: number | null;
}

// Evaluate Checklist 0–8
export function evaluateBreakoutScalp(
  config: BreakoutScalpAssetConfig,
  side: ScalpSide,
  ltfCandles: Candle[],
  h1Candles: Candle[],
  h4Candles: Candle[],
  d1Candles: Candle[]
): ScalpChecklistResult {
  const level = side === 'bull' ? config.levelHigh : config.levelLow;
  const levelSetAt = side === 'bull' ? config.levelHighSetAt : config.levelLowSetAt;
  const items: ChecklistItemResult[] = [];

  const ltfSec = config.timeframe === '1m' ? 60 : 300;
  const closedLTF = filterClosedCandles(ltfCandles, ltfSec);
  const closedH1 = filterClosedCandles(h1Candles, 3600);
  const closedH4 = filterClosedCandles(h4Candles, 14400);
  const closedD1 = filterClosedCandles(d1Candles, 86400);

  const hasLTF = closedLTF.length >= 26;
  const hasH4 = closedH4.length >= 50;
  const hasH1 = closedH1.length >= 50;
  const hasD1 = closedD1.length >= 15;

  const lastClosed = closedLTF.length > 0 ? closedLTF[closedLTF.length - 1] : null;
  const currentPrice = lastClosed ? lastClosed.close : 0;

  // 1. Precalculate indicators only when data is strictly sufficient (NO FAKE FALLBACKS)
  let h4EMA50 = 0;
  let h4EMA20 = 0;
  let h4ATR = 0;
  let lastH4Close = 0;
  if (hasH4) {
    const h4Closes = closedH4.map(c => c.close);
    const ema50Arr = calculateEMAValues(h4Closes, 50);
    const ema20Arr = calculateEMAValues(h4Closes, 20);
    const atrArr = calculateATR(closedH4, 14);
    h4EMA50 = ema50Arr[ema50Arr.length - 1];
    h4EMA20 = ema20Arr[ema20Arr.length - 1];
    h4ATR = atrArr[atrArr.length - 1];
    lastH4Close = h4Closes[h4Closes.length - 1];
  }

  let h1EMA50 = 0;
  let h1EMA20 = 0;
  let lastH1Close = 0;
  if (hasH1) {
    const h1Closes = closedH1.map(c => c.close);
    const ema50Arr = calculateEMAValues(h1Closes, 50);
    const ema20Arr = calculateEMAValues(h1Closes, 20);
    h1EMA50 = ema50Arr[ema50Arr.length - 1];
    h1EMA20 = ema20Arr[ema20Arr.length - 1];
    lastH1Close = h1Closes[h1Closes.length - 1];
  }

  let d1RSI = 0;
  let d1ATR = 0;
  let high120 = 0;
  let low120 = 0;
  if (hasD1) {
    const d1Closes = closedD1.map(c => c.close);
    const rsiArr = calculateRSIValues(d1Closes, 14);
    const atrArr = calculateATR(closedD1, 14);
    d1RSI = rsiArr[rsiArr.length - 1];
    d1ATR = atrArr[atrArr.length - 1];

    const recentD120 = closedD1.slice(-120);
    high120 = Math.max(...recentD120.map(c => c.high));
    low120 = Math.min(...recentD120.map(c => c.low));
  }

  const ltfATRArr = hasLTF ? calculateATR(closedLTF, 14) : [];
  const lastLtfATR = ltfATRArr.length > 0 ? ltfATRArr[ltfATRArr.length - 1] : 0;

  // --- Step 4 Check first: Find Trigger Candle within last 10 closed bars ---
  let triggerEval: TriggerEvaluation | null = null;
  let hasAvgVolZero = false;

  if (level !== null && level > 0 && hasLTF) {
    const maxSearchBars = Math.min(10, closedLTF.length - 21);
    for (let offset = 0; offset < maxSearchBars; offset++) {
      const idx = closedLTF.length - 1 - offset;
      const c = closedLTF[idx];

      // 20 bars prior to this candle
      const prior20 = closedLTF.slice(idx - 20, idx);
      const avgVol20 = prior20.reduce((sum, b) => sum + (b.volume || 0), 0) / 20;

      if (avgVol20 === 0) {
        hasAvgVolZero = true;
      }

      // Prior 5 bars
      const prior5 = closedLTF.slice(idx - 5, idx);
      const maxHigh5 = Math.max(...prior5.map(b => b.high));
      const minLow5 = Math.min(...prior5.map(b => b.low));

      const volRatio = avgVol20 > 0 ? c.volume / avgVol20 : 0;
      const volPasses = volRatio >= 2.0;

      if (side === 'bull') {
        const closeAboveLevel = c.close > level;
        const closeAbove5High = c.close > maxHigh5;
        if (volPasses && closeAboveLevel && closeAbove5High) {
          const prevCandle = closedLTF[idx - 1];
          const isGreen = c.close >= c.open;
          const prevIsRed = prevCandle ? prevCandle.close < prevCandle.open : false;
          const shortCoveringWarning = isGreen && prevIsRed && c.close <= prevCandle.open;

          triggerEval = {
            triggerIndex: idx,
            triggerCandle: c,
            barsAgo: offset,
            volumeRatio: Number(volRatio.toFixed(2)),
            isShortCoveringWarning: shortCoveringWarning,
          };
          break;
        }
      } else {
        const closeBelowLevel = c.close < level;
        const closeBelow5Low = c.close < minLow5;
        if (volPasses && closeBelowLevel && closeBelow5Low) {
          triggerEval = {
            triggerIndex: idx,
            triggerCandle: c,
            barsAgo: offset,
            volumeRatio: Number(volRatio.toFixed(2)),
            isShortCoveringWarning: false,
          };
          break;
        }
      }
    }
  }

  // --- Step 0: Setup + Zone ---
  if (!hasH4 || !hasD1 || !hasLTF) {
    const missing: string[] = [];
    if (!hasH4) missing.push(`H4 (${closedH4.length}/50)`);
    if (!hasD1) missing.push(`D1 (${closedD1.length}/15)`);
    if (!hasLTF) missing.push(`LTF (${closedLTF.length}/26)`);
    items.push({
      step: 0,
      title: 'Setup + Zone',
      fact: `ข้อมูลแท่งเทียนไม่เพียงพอ: ${missing.join(', ')}`,
      inference: `ข้อมูลไม่พอ: ${missing.map(m => m.split(' ')[0]).join(', ')}`,
      status: 'unknown',
    });
  } else {
    const diffH4 = currentPrice - h4EMA50;
    const atrMultipleH4 = h4ATR > 0 ? diffH4 / h4ATR : 0;
    const distHigh120 = Math.abs(high120 - currentPrice);
    const distLow120 = Math.abs(currentPrice - low120);

    // Extreme definitions (signed / directional)
    // extremeUp = (close - EMA50 H4) > 2×ATR H4 หรือ RSI D1 > 70 หรือ ห่าง high 120 วัน ≤ 1×ATR D1
    // extremeDown = (close - EMA50 H4) < -2×ATR H4 หรือ RSI D1 < 30 หรือ ห่าง low 120 วัน ≤ 1×ATR D1
    const extremeUp = (diffH4 > 2 * h4ATR) || (d1RSI > 70) || (distHigh120 <= 1 * d1ATR);
    const extremeDown = (diffH4 < -2 * h4ATR) || (d1RSI < 30) || (distLow120 <= 1 * d1ATR);

    let extremeDesc = 'ไม่อยู่ในโซนสุดขั้ว';
    if (extremeUp && extremeDown) extremeDesc = 'สุดขั้วทั้งสองฝั่ง (ผันผวนสูง)';
    else if (extremeUp) extremeDesc = 'สุดขั้วฝั่งขึ้น';
    else if (extremeDown) extremeDesc = 'สุดขั้วฝั่งลง';

    const step0Fact = `ห่าง EMA50 H4=${diffH4 >= 0 ? '+' : ''}${atrMultipleH4.toFixed(1)}×ATR (${diffH4 >= 0 ? '+' : ''}${diffH4.toFixed(config.decimals)}) · RSI D1=${d1RSI.toFixed(1)} · High120=${high120.toFixed(config.decimals)}, Low120=${low120.toFixed(config.decimals)} · โซน=${extremeDesc}`;

    let step0Status: ChecklistItemResult['status'] = 'pass';
    let step0Inference = '';

    if (config.fundDirection === 'unclear') {
      step0Status = 'unknown';
      step0Inference = 'Fund ไม่ชัดเจน กรุณาระบุทิศทาง Fundamental';
    } else {
      const isFundAligned = (side === 'bull' && config.fundDirection === 'up') || (side === 'bear' && config.fundDirection === 'down');

      if (config.setup === 'Trend') {
        if (!isFundAligned) {
          step0Status = 'fail';
          step0Inference = 'Trend ต้องไปทางเดียวกับ fund';
        } else if ((config.fundDirection === 'up' && extremeUp) || (config.fundDirection === 'down' && extremeDown)) {
          step0Status = 'fail';
          step0Inference = 'ไม่ไล่ (ราคาอยู่โซนสุดขั้วตามทาง Fund)';
        } else {
          step0Status = 'pass';
          step0Inference = 'Trend ไปตามทาง Fund และไม่อยู่ในโซนสุดขั้วตามทาง Fund';
        }
      } else if (config.setup === 'Rebound') {
        // Rebound ต้องไปทาง fund
        if (!isFundAligned) {
          step0Status = 'fail';
          step0Inference = 'Rebound ต้องไปทางเดียวกับ fund';
        } else if ((config.fundDirection === 'up' && extremeUp) || (config.fundDirection === 'down' && extremeDown)) {
          step0Status = 'fail';
          step0Inference = 'ไม่ไล่ (ราคาอยู่โซนสุดขั้วตามทาง Fund)';
        } else if ((config.fundDirection === 'up' && extremeDown) || (config.fundDirection === 'down' && extremeUp)) {
          step0Status = 'pass';
          step0Inference = 'สุดขั้วสวน fund → เข้าลักษณะ Rebound (ยืนยันเองว่า fund ไม่ได้เปลี่ยนจริง)';
        } else {
          step0Status = 'warn';
          step0Inference = 'ยังไม่พบภาวะสุดขั้วสวน fund';
        }
      } else if (config.setup === 'Impulse') {
        // Impulse ต้องสวน fund
        if (isFundAligned) {
          step0Status = 'fail';
          step0Inference = 'Impulse ต้องเป็นเทรดสวนทาง Fund';
        } else {
          step0Status = 'pass';
          step0Inference = 'Impulse สวนทาง Fund ตามกลยุทธ์';
        }
      }
    }

    items.push({
      step: 0,
      title: 'Setup + Zone',
      fact: step0Fact,
      inference: step0Inference,
      status: step0Status,
    });
  }

  // --- Step 1: Context ---
  if (!hasH4 || !hasH1) {
    const missing: string[] = [];
    if (!hasH4) missing.push(`H4 (${closedH4.length}/50)`);
    if (!hasH1) missing.push(`H1 (${closedH1.length}/50)`);
    items.push({
      step: 1,
      title: 'Context',
      fact: `ข้อมูลแท่งเทียนไม่เพียงพอ: ${missing.join(', ')}`,
      inference: `ข้อมูลไม่พอ: ${missing.map(m => m.split(' ')[0]).join(', ')}`,
      status: 'unknown',
    });
  } else {
    const h4Bull = lastH4Close > h4EMA50 && h4EMA20 > h4EMA50;
    const h4Bear = lastH4Close < h4EMA50 && h4EMA20 < h4EMA50;
    const h1Bull = lastH1Close > h1EMA50 && h1EMA20 > h1EMA50;
    const h1Bear = lastH1Close < h1EMA50 && h1EMA20 < h1EMA50;

    const targetSideBull = side === 'bull';
    const htfAligned = targetSideBull ? (h4Bull && h1Bull) : (h4Bear && h1Bear);

    let step1Status: ChecklistItemResult['status'] = 'pass';
    let step1Inference = '';

    if (config.setup === 'Trend' || config.setup === 'Rebound') {
      const fundAligned = targetSideBull ? config.fundDirection === 'up' : config.fundDirection === 'down';
      if (fundAligned && htfAligned) {
        step1Status = 'pass';
        step1Inference = 'Fund + H4 + H1 ตรงทิศเดียวกัน';
      } else {
        step1Status = 'fail';
        step1Inference = 'Context ไม่ตรงทิศ (ต้องการ Fund + H4 + H1 สอดคล้องกัน)';
      }
    } else if (config.setup === 'Impulse') {
      // Impulse Checklist เรียงลำดับตรวจใหม่:
      // 1. ไม่ติ๊ก narrative -> ❌
      if (!config.hasClearNarrative) {
        step1Status = 'fail';
        step1Inference = 'ขาด Narrative ที่ชัดเจน';
      } else {
        // 2. vol 3 แท่ง (นับถึงแท่ง trigger ถ้ามี) ไม่ไต่ขึ้นต่อเนื่อง -> ❌ "vol ยังไม่ไต่ต่อเนื่อง"
        const endIdx = triggerEval ? triggerEval.triggerIndex : closedLTF.length - 1;
        let vol3Rising = false;
        let v0 = 0, v1 = 0, v2 = 0;
        if (endIdx >= 2 && closedLTF.length >= 3) {
          v0 = closedLTF[endIdx - 2].volume || 0;
          v1 = closedLTF[endIdx - 1].volume || 0;
          v2 = closedLTF[endIdx].volume || 0;
          vol3Rising = v2 > v1 && v1 > v0;
        }

        if (!vol3Rising) {
          step1Status = 'fail';
          step1Inference = 'vol ยังไม่ไต่ต่อเนื่อง';
        } else {
          // 3. ผ่านทั้งสองแต่สวน H4/H1 -> ⚠️ "เสี่ยงกลับตัวเร็ว" / ไม่สวน -> ✅
          if (!htfAligned) {
            step1Status = 'warn';
            step1Inference = 'เสี่ยงกลับตัวเร็ว';
          } else {
            step1Status = 'pass';
            step1Inference = 'Narrative ชัด + Vol ไต่ต่อเนื่อง + ทิศทางสอดคล้อง';
          }
        }
      }
    }

    items.push({
      step: 1,
      title: 'Context',
      fact: `H4=${h4Bull ? 'Bull' : h4Bear ? 'Bear' : 'Mixed'} (EMA20=${h4EMA20.toFixed(config.decimals)}, EMA50=${h4EMA50.toFixed(config.decimals)}) · H1=${h1Bull ? 'Bull' : h1Bear ? 'Bear' : 'Mixed'} · Narrative=${config.hasClearNarrative ? 'มี' : 'ไม่มี'}`,
      inference: step1Inference,
      status: step1Status,
    });
  }

  // --- Step 2: Level ---
  let step2Status: ChecklistItemResult['status'] = 'pass';
  let step2Inference = '';
  if (level === null || level <= 0) {
    step2Status = 'fail';
    step2Inference = `ยังไม่ได้กำหนดเส้น${side === 'bull' ? 'บน' : 'ล่าง'}`;
  } else if (!levelSetAt) {
    step2Status = 'warn';
    step2Inference = `กำหนดเส้น ${level.toFixed(config.decimals)} แต่ไม่พบบันทึกเวลาที่ตั้ง`;
  } else if (triggerEval) {
    const triggerTimeMs = triggerEval.triggerCandle.time * 1000;
    if (levelSetAt <= triggerTimeMs) {
      step2Status = 'pass';
      step2Inference = 'มีเส้น และตั้งไว้ก่อนเกิดแท่ง Trigger';
    } else {
      step2Status = 'fail';
      step2Inference = 'เส้นถูกตั้งขึ้นหลังเกิดแท่ง Trigger';
    }
  } else {
    step2Status = 'pass';
    step2Inference = `มีเส้น ${level.toFixed(config.decimals)} รอดัก Breakout`;
  }
  const dateSet = levelSetAt ? new Date(levelSetAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-';
  items.push({
    step: 2,
    title: 'Level',
    fact: `เส้น=${level !== null ? level.toFixed(config.decimals) : '-'} (ตั้งเมื่อ ${dateSet})`,
    inference: step2Inference,
    status: step2Status,
  });

  // --- Step 3: Compression ---
  if (!hasLTF) {
    items.push({
      step: 3,
      title: 'Compression',
      fact: `ข้อมูลแท่งเทียน LTF ไม่เพียงพอ (${closedLTF.length}/26 แท่ง)`,
      inference: 'ข้อมูลไม่พอ: LTF',
      status: 'unknown',
    });
  } else if (level === null || level <= 0) {
    items.push({
      step: 3,
      title: 'Compression',
      fact: 'ยังไม่ได้กำหนดเส้นระดับราคา',
      inference: 'รอการกำหนดเส้นระดับราคา',
      status: 'unknown',
    });
  } else {
    const refIndex = triggerEval ? triggerEval.triggerIndex : closedLTF.length - 1;
    const prior5 = closedLTF.slice(refIndex - 5, refIndex);
    const prior20 = closedLTF.slice(refIndex - 25, refIndex - 5);

    const avgRange5 = prior5.reduce((sum, c) => sum + (c.high - c.low), 0) / 5;
    const avgRange20 = prior20.reduce((sum, c) => sum + (c.high - c.low), 0) / 20;

    const avgVol5 = prior5.reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
    const avgVol20 = prior20.reduce((sum, c) => sum + (c.volume || 0), 0) / 20;

    if (avgVol20 === 0) {
      items.push({
        step: 3,
        title: 'Compression',
        fact: 'Volume เฉลี่ย 20 แท่ง = 0',
        inference: 'ข้อมูลไม่พอ: Volume เฉลี่ย 20 แท่ง = 0',
        status: 'unknown',
      });
    } else {
      const rangeCompressed = avgRange5 < avgRange20;
      const volCompressed = avgVol5 < avgVol20;
      const distToLine = Math.min(...prior5.map(c => Math.abs(c.close - level)));
      const nearLine = lastLtfATR > 0 ? distToLine <= 1.0 * lastLtfATR : true;

      const step3Fact = `Range 5บาร์=${avgRange5.toFixed(config.decimals)} (vs 20บาร์=${avgRange20.toFixed(config.decimals)}) · Vol 5บาร์=${Math.round(avgVol5)} (vs 20บาร์=${Math.round(avgVol20)}) · ห่างเส้น=${distToLine.toFixed(config.decimals)} (1×ATR=${lastLtfATR.toFixed(config.decimals)})`;
      let step3Status: ChecklistItemResult['status'] = 'pass';
      let step3Inference = '';

      if (rangeCompressed && volCompressed && nearLine) {
        step3Status = 'pass';
        step3Inference = 'Range & Vol บีบตัวต่ำกว่า 20 บาร์ก่อนหน้า + เกาะชิดเส้น';
      } else {
        step3Status = 'fail';
        step3Inference = 'ยังไม่เกิดการบีบตัว (Compression) ก่อนถึงเส้น';
      }

      items.push({
        step: 3,
        title: 'Compression',
        fact: step3Fact,
        inference: step3Inference,
        status: step3Status,
      });
    }
  }

  // --- Step 4: Trigger ---
  if (!hasLTF) {
    items.push({
      step: 4,
      title: 'Trigger',
      fact: `ข้อมูลแท่งเทียน LTF ไม่เพียงพอ (${closedLTF.length}/26 แท่ง)`,
      inference: 'ข้อมูลไม่พอ: LTF',
      status: 'unknown',
    });
  } else if (hasAvgVolZero) {
    items.push({
      step: 4,
      title: 'Trigger',
      fact: 'Volume เฉลี่ย 20 แท่ง = 0',
      inference: 'ข้อมูลไม่พอ: Volume เฉลี่ย 20 แท่ง = 0',
      status: 'unknown',
    });
  } else if (triggerEval) {
    const triggerTime = new Date(triggerEval.triggerCandle.time * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const step4Fact = `แท่ง ${triggerTime} (ย้อนหลัง ${triggerEval.barsAgo} บาร์) ปิด=${triggerEval.triggerCandle.close.toFixed(config.decimals)} · Vol=${triggerEval.volumeRatio}× เฉลี่ย 20`;
    let step4Status: ChecklistItemResult['status'] = 'pass';
    let step4Inference = '';

    if (triggerEval.isShortCoveringWarning) {
      step4Status = 'warn';
      step4Inference = 'อาจแค่ short covering (แท่งเขียวปิดไม่เกิน open ของแท่งแดงก่อนหน้า)';
    } else {
      step4Status = 'pass';
      step4Inference = `เข้าเงื่อนไข Trigger ทะลุเส้นปิด ${side === 'bull' ? 'เหนือ' : 'ใต้'}เส้น และ Vol >= 2×`;
    }

    items.push({
      step: 4,
      title: 'Trigger',
      fact: step4Fact,
      inference: step4Inference,
      status: step4Status,
    });
  } else {
    items.push({
      step: 4,
      title: 'Trigger',
      fact: `ย้อนหลัง 10 แท่งปิดล่าสุด ไม่มีแท่งที่ปิดทะลุเส้น ${level !== null ? level.toFixed(config.decimals) : '-'} พร้อม Vol >= 2×`,
      inference: 'ยังไม่พบแท่ง Trigger (ไส้ทะลุแต่เนื้อไม่ปิดข้ามเส้นไม่นับ)',
      status: 'fail',
    });
  }

  // --- Step 5, 6, 8: Entry, Stop, R/R Calculation (NO Math.abs!) ---
  const dir = side === 'bull' ? 1 : -1;
  let entryPrice: number | null = null;
  let stopPrice: number | null = null;
  let riskAmount: number | null = null;
  let rewardAmount: number | null = null;
  let target3R: number | null = null;
  let actualRR: number | null = null;
  let isWaitingBreakoutCandle = false;

  const realTarget = side === 'bull' ? config.targetBull : config.targetBear;

  if (level !== null && level > 0) {
    // 1. Entry price
    if (config.entryMode === 'immediate') {
      if (triggerEval) {
        entryPrice = side === 'bull' ? triggerEval.triggerCandle.close + config.buffer : triggerEval.triggerCandle.close - config.buffer;
      } else {
        entryPrice = side === 'bull' ? level + config.buffer : level - config.buffer;
      }
    } else {
      // Retest mode
      entryPrice = side === 'bull' ? level + config.buffer : level - config.buffer;
    }

    // 2. Stop price
    if (config.stopMode === 'beyond_line') {
      stopPrice = side === 'bull' ? level - config.buffer : level + config.buffer;
    } else {
      // candle_extreme: ห้ามใช้แท่งปิดล่าสุดแทน ถ้ายังไม่มีแท่ง trigger
      if (triggerEval) {
        stopPrice = side === 'bull' ? triggerEval.triggerCandle.low - config.buffer : triggerEval.triggerCandle.high + config.buffer;
      } else {
        isWaitingBreakoutCandle = true;
        stopPrice = null;
      }
    }

    // 3. Risk and Reward (Signed calculation: (entry - stop)*dir, (target - entry)*dir)
    if (entryPrice !== null && stopPrice !== null) {
      riskAmount = (entryPrice - stopPrice) * dir;
      if (riskAmount > 0) {
        target3R = side === 'bull' ? entryPrice + 3 * riskAmount : entryPrice - 3 * riskAmount;
      }

      if (realTarget !== null) {
        rewardAmount = (realTarget - entryPrice) * dir;
        if (riskAmount > 0 && rewardAmount > 0) {
          actualRR = Number((rewardAmount / riskAmount).toFixed(2));
        }
      }
    }
  }

  // --- Step 5: Entry ---
  let step5Status: ChecklistItemResult['status'] = 'pass';
  const step5Inferences: string[] = [];

  const hasEventWarning = config.isEventFirstCandle;
  const hasBufferWarning = config.buffer === 0;

  if (hasEventWarning) {
    step5Inferences.push('แท่งแรก CPI/NFP/Fed อาจ fake / spread กว้าง');
  }
  if (hasBufferWarning) {
    step5Inferences.push('ยังไม่ใส่ spread/slippage');
  }

  if (isWaitingBreakoutCandle) {
    step5Status = 'unknown';
    step5Inferences.unshift('รอแท่ง breakout');
  } else if (entryPrice === null) {
    step5Status = 'fail';
    step5Inferences.unshift('ยังไม่มีจุดเข้า');
  } else {
    // Error checks (❌ ชนะ ⚠️)
    if (riskAmount !== null && riskAmount <= 0) {
      step5Status = 'fail';
      step5Inferences.unshift('Stop อยู่ผิดฝั่ง entry');
    } else if (realTarget !== null && rewardAmount !== null && rewardAmount <= 0) {
      step5Status = 'fail';
      step5Inferences.unshift('เป้าอยู่ผิดฝั่ง entry');
    } else if (actualRR !== null && actualRR < 3.0) {
      step5Status = 'fail';
      step5Inferences.unshift(`ไม่เข้าเกณฑ์ (R:R ${actualRR} < 3)`);
    } else if (actualRR !== null && actualRR >= 3.0) {
      step5Inferences.unshift(`เข้าเกณฑ์ (R:R จริง=${actualRR} >= 3)`);
      if (hasEventWarning || hasBufferWarning) {
        step5Status = 'warn';
      } else {
        step5Status = 'pass';
      }
    } else {
      step5Inferences.unshift(`Entry=${entryPrice.toFixed(config.decimals)} (กรุณาระบุเป้าจริงเพื่อคำนวณ R:R)`);
      step5Status = (hasEventWarning || hasBufferWarning) ? 'warn' : 'unknown';
    }
  }

  const step5Fact = `โหมด=${config.entryMode === 'immediate' ? 'ทะลุทันที' : 'Retest'} · จุดเข้า=${entryPrice !== null ? entryPrice.toFixed(config.decimals) : '-'} · Buffer=${config.buffer} · ราคาบนชาร์ตคือ bid ราคาเข้าจริงอาจแย่กว่าเส้น`;

  items.push({
    step: 5,
    title: 'Entry',
    fact: step5Fact,
    inference: step5Inferences.join(' · '),
    status: step5Status,
  });

  // --- Step 6: Stop ---
  let step6Status: ChecklistItemResult['status'] = 'pass';
  let step6Inference = '';
  let step6Fact = '';

  if (isWaitingBreakoutCandle) {
    step6Status = 'unknown';
    step6Inference = 'รอแท่ง breakout';
    step6Fact = `โหมด=สุดแท่ง Breakout · ยังไม่พบแท่ง Breakout Trigger`;
  } else if (stopPrice !== null && entryPrice !== null && riskAmount !== null) {
    if (riskAmount <= 0) {
      step6Status = 'fail';
      step6Inference = 'Stop อยู่ผิดฝั่ง entry';
    } else {
      step6Status = 'pass';
      step6Inference = `Stop ที่ ${stopPrice.toFixed(config.decimals)} (ระยะ Risk=${riskAmount.toFixed(config.decimals)})`;
    }
    step6Fact = `โหมด=${config.stopMode === 'beyond_line' ? 'ใต้/เหนือเส้น' : 'ใต้/เหนือแท่ง breakout'} · ราคา Stop=${stopPrice.toFixed(config.decimals)} · ระยะ Risk=${riskAmount.toFixed(config.decimals)}`;
  } else {
    step6Status = 'fail';
    step6Inference = 'ยังไม่สามารถคำนวณ Stop Loss';
    step6Fact = `โหมด=${config.stopMode === 'beyond_line' ? 'ใต้/เหนือเส้น' : 'ใต้/เหนือแท่ง breakout'} · ราคา Stop=-`;
  }

  items.push({
    step: 6,
    title: 'Stop',
    fact: step6Fact,
    inference: step6Inference,
    status: step6Status,
  });

  // --- Step 7: Exit ---
  let step7Status: ChecklistItemResult['status'] = 'info';
  let step7Inference = 'รอสัญญาณ Trigger';
  let step7Fact = 'ยังไม่พบแท่ง Breakout Trigger';
  if (triggerEval && level !== null) {
    const postTriggerCandles = closedLTF.slice(triggerEval.triggerIndex + 1);
    let closedBackInside = false;
    let maxGain = 0;

    for (const c of postTriggerCandles) {
      if (side === 'bull') {
        if (c.close < level) closedBackInside = true;
        if (entryPrice) maxGain = Math.max(maxGain, c.high - entryPrice);
      } else {
        if (c.close > level) closedBackInside = true;
        if (entryPrice) maxGain = Math.max(maxGain, entryPrice - c.low);
      }
    }

    const triggerTimeSec = triggerEval.triggerCandle.time;
    const nowSec = Math.floor(Date.now() / 1000);
    const elapsedSec = nowSec - (triggerTimeSec + ltfSec);
    const isOver5Min = elapsedSec > 300;
    const risk = riskAmount && riskAmount > 0 ? riskAmount : 1;
    const reached1R = maxGain >= 1.0 * risk;

    step7Fact = `แท่งหลัง Trigger=${postTriggerCandles.length} แท่ง · ผ่านไป=${Math.floor(elapsedSec / 60)} นาที · MaxGain=${maxGain.toFixed(config.decimals)} (1R=${risk.toFixed(config.decimals)})`;

    if (closedBackInside) {
      step7Status = 'warn';
      step7Inference = 'มีแท่งปิดกลับฝั่งเส้น (สัญญาณเสี่ยง False Breakout)';
    } else if (isOver5Min && !reached1R) {
      step7Status = 'warn';
      step7Inference = 'time stop (เกิน 5 นาทีวิ่งไม่ถึง 1R)';
    } else {
      step7Status = 'info';
      step7Inference = 'กำลังดำเนินตามแผน (ยังไม่พบสัญญาณออกก่อนกำหนด)';
    }
  }
  items.push({
    step: 7,
    title: 'Exit',
    fact: step7Fact,
    inference: step7Inference,
    status: step7Status,
  });

  // --- Step 8: R/R ---
  let step8Status: ChecklistItemResult['status'] = 'unknown';
  let step8Inference = '';
  let step8Fact = '';

  if (isWaitingBreakoutCandle) {
    step8Status = 'unknown';
    step8Inference = 'รอแท่ง breakout';
    step8Fact = 'รอแท่ง breakout เพื่อคำนวณ Risk และ R:R';
  } else if (riskAmount !== null && riskAmount <= 0) {
    step8Status = 'fail';
    step8Inference = 'Stop อยู่ผิดฝั่ง entry';
    step8Fact = `Risk=${riskAmount.toFixed(config.decimals)} (Stop อยู่ผิดฝั่ง) · เป้าจริง=${realTarget !== null ? realTarget.toFixed(config.decimals) : '-'}`;
  } else if (realTarget === null) {
    step8Status = 'unknown';
    step8Inference = 'กรุณาระบุเป้าหมายจริงเพื่อคำนวณอัตราผลตอบแทนต่อความเสี่ยง';
    step8Fact = `Risk=${riskAmount !== null ? riskAmount.toFixed(config.decimals) : '-'} · ราคาที่ 3R=${target3R !== null ? target3R.toFixed(config.decimals) : '-'} · ยังไม่ระบุเป้าจริง`;
  } else if (rewardAmount !== null && rewardAmount <= 0) {
    step8Status = 'fail';
    step8Inference = 'เป้าอยู่ผิดฝั่ง entry';
    step8Fact = `Risk=${riskAmount !== null ? riskAmount.toFixed(config.decimals) : '-'} · Reward=${rewardAmount.toFixed(config.decimals)} (เป้าอยู่ผิดฝั่ง entry)`;
  } else if (actualRR !== null) {
    if (actualRR < 3.0) {
      step8Status = 'fail';
      step8Inference = `ไม่เข้าเกณฑ์ (R:R ${actualRR} < 3)`;
    } else {
      step8Status = 'pass';
      step8Inference = `เข้าเกณฑ์ (R:R ${actualRR} >= 3)`;
    }
    step8Fact = `Risk=${riskAmount?.toFixed(config.decimals)} · ราคาที่ 3R=${target3R?.toFixed(config.decimals)} · Reward=${rewardAmount?.toFixed(config.decimals)} · R:R เป้าจริง=1 : ${actualRR}`;
  } else {
    step8Status = 'fail';
    step8Inference = 'ไม่สามารถคำนวณ R:R ได้';
    step8Fact = '-';
  }

  items.push({
    step: 8,
    title: 'R/R & เป้าหมาย',
    fact: step8Fact,
    inference: step8Inference,
    status: step8Status,
  });

  return {
    side,
    level,
    trigger: triggerEval,
    items,
    entryPrice,
    stopPrice,
    riskAmount,
    target3R,
    actualRR,
  };
}
