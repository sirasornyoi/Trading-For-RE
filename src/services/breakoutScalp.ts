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
      alertEnabled: true,
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

  const lastClosed = closedLTF.length > 0 ? closedLTF[closedLTF.length - 1] : null;
  const currentPrice = lastClosed ? lastClosed.close : 0;

  // 1. Precalculate indicators for HTF
  const h4Closes = closedH4.map(c => c.close);
  const h4EMA50Arr = calculateEMAValues(h4Closes, 50);
  const h4EMA20Arr = calculateEMAValues(h4Closes, 20);
  const h4ATRArr = calculateATR(closedH4, 14);

  const h1Closes = closedH1.map(c => c.close);
  const h1EMA50Arr = calculateEMAValues(h1Closes, 50);
  const h1EMA20Arr = calculateEMAValues(h1Closes, 20);

  const d1Closes = closedD1.map(c => c.close);
  const d1RSIArr = calculateRSIValues(d1Closes, 14);
  const d1ATRArr = calculateATR(closedD1, 14);

  const ltfATRArr = calculateATR(closedLTF, 14);

  const lastH4EMA50 = h4EMA50Arr.length > 0 ? h4EMA50Arr[h4EMA50Arr.length - 1] : 0;
  const lastH4EMA20 = h4EMA20Arr.length > 0 ? h4EMA20Arr[h4EMA20Arr.length - 1] : 0;
  const lastH4ATR = h4ATRArr.length > 0 ? h4ATRArr[h4ATRArr.length - 1] : 1;
  const lastH4Close = h4Closes.length > 0 ? h4Closes[h4Closes.length - 1] : 0;

  const lastH1EMA50 = h1EMA50Arr.length > 0 ? h1EMA50Arr[h1EMA50Arr.length - 1] : 0;
  const lastH1EMA20 = h1EMA20Arr.length > 0 ? h1EMA20Arr[h1EMA20Arr.length - 1] : 0;
  const lastH1Close = h1Closes.length > 0 ? h1Closes[h1Closes.length - 1] : 0;

  const lastD1RSI = d1RSIArr.length > 0 ? d1RSIArr[d1RSIArr.length - 1] : 50;
  const lastD1ATR = d1ATRArr.length > 0 ? d1ATRArr[d1ATRArr.length - 1] : 1;
  const lastLtfATR = ltfATRArr.length > 0 ? ltfATRArr[ltfATRArr.length - 1] : 1;

  // 120-day High / Low
  const recentD120 = closedD1.slice(-120);
  let high120 = -Infinity;
  let low120 = Infinity;
  for (const c of recentD120) {
    if (c.high > high120) high120 = c.high;
    if (c.low < low120) low120 = c.low;
  }
  const distHigh120 = high120 > -Infinity ? Math.abs(currentPrice - high120) : Infinity;
  const distLow120 = low120 < Infinity ? Math.abs(currentPrice - low120) : Infinity;

  // Extreme condition check
  const distH4EMA50 = Math.abs(currentPrice - lastH4EMA50);
  const isExtremeH4 = distH4EMA50 > 2 * lastH4ATR;
  const isExtremeD1RSI = lastD1RSI > 70 || lastD1RSI < 30;
  const isExtreme120 = distHigh120 <= 1 * lastD1ATR || distLow120 <= 1 * lastD1ATR;
  const isExtremeZone = isExtremeH4 || isExtremeD1RSI || isExtreme120;

  // --- Step 4 Check first: Find Trigger Candle within last 10 closed bars ---
  let triggerEval: TriggerEvaluation | null = null;
  if (level !== null && level > 0 && closedLTF.length >= 25) {
    const maxSearchBars = Math.min(10, closedLTF.length - 21);
    for (let offset = 0; offset < maxSearchBars; offset++) {
      const idx = closedLTF.length - 1 - offset;
      const c = closedLTF[idx];

      // 20 bars prior to this candle
      const prior20 = closedLTF.slice(idx - 20, idx);
      const avgVol20 = prior20.reduce((sum, b) => sum + (b.volume || 0), 0) / 20;

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
          // Check short covering warning: green candle close doesn't exceed open of preceding red candle
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
  let step0Status: ChecklistItemResult['status'] = 'pass';
  let step0Inference = 'Setup สอดคล้องกับโซน';
  const step0Facts: string[] = [
    `Setup=${config.setup}`,
    `Fund=${config.fundDirection === 'up' ? 'ขึ้น' : config.fundDirection === 'down' ? 'ลง' : 'ไม่ชัด'}`,
    `ห่าง EMA50(H4)=${distH4EMA50.toFixed(config.decimals)} (2×ATR=${(2 * lastH4ATR).toFixed(config.decimals)})`,
    `RSI(D1)=${lastD1RSI.toFixed(1)}`,
  ];

  if (config.fundDirection === 'unclear') {
    step0Status = 'unknown';
    step0Inference = 'Fund ไม่ชัดเจน กรุณาระบุทิศทาง Fundamental';
  } else {
    const isFundAligned = (side === 'bull' && config.fundDirection === 'up') || (side === 'bear' && config.fundDirection === 'down');
    if (config.setup === 'Trend' || config.setup === 'Rebound') {
      if (!isFundAligned) {
        step0Status = 'fail';
        step0Inference = `${config.setup} ต้องไปทางเดียวกับ Fund`;
      } else if (isExtremeZone) {
        step0Status = 'fail';
        step0Inference = 'ไม่ไล่ (ราคาอยู่โซนสุดขั้วตามทาง Fund)';
      } else {
        step0Status = 'pass';
        step0Inference = `${config.setup} ไปตามทิศทาง Fund และไม่อยู่ในโซนสุดขั้ว`;
      }
    } else if (config.setup === 'Impulse') {
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
    fact: step0Facts.join(' · '),
    inference: step0Inference,
    status: step0Status,
  });

  // --- Step 1: Context ---
  let step1Status: ChecklistItemResult['status'] = 'pass';
  let step1Inference = '';
  // Check H4 trend: close and EMA20 on same side of EMA50
  const h4Bull = lastH4Close > lastH4EMA50 && lastH4EMA20 > lastH4EMA50;
  const h4Bear = lastH4Close < lastH4EMA50 && lastH4EMA20 < lastH4EMA50;
  const h1Bull = lastH1Close > lastH1EMA50 && lastH1EMA20 > lastH1EMA50;
  const h1Bear = lastH1Close < lastH1EMA50 && lastH1EMA20 < lastH1EMA50;

  const targetSideBull = side === 'bull';
  const htfAligned = targetSideBull ? (h4Bull && h1Bull) : (h4Bear && h1Bear);

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
    // 3 consecutive rising volumes in closed LTF
    let vol3Rising = false;
    if (closedLTF.length >= 3) {
      const v0 = closedLTF[closedLTF.length - 1].volume || 0;
      const v1 = closedLTF[closedLTF.length - 2].volume || 0;
      const v2 = closedLTF[closedLTF.length - 3].volume || 0;
      vol3Rising = v0 > v1 && v1 > v2;
    }
    if (!config.hasClearNarrative) {
      step1Status = 'fail';
      step1Inference = 'ขาด Narrative ที่ชัดเจน';
    } else if (!htfAligned) {
      step1Status = 'warn';
      step1Inference = 'เสี่ยงกลับตัวเร็ว (Impulse สวน HTF H4/H1)';
    } else if (vol3Rising) {
      step1Status = 'pass';
      step1Inference = 'Narrative ชัด + Volume 3 แท่งไต่ระดับขึ้น';
    } else {
      step1Status = 'warn';
      step1Inference = 'Volume 3 แท่งยังไม่ไต่ระดับขึ้นอย่างชัดเจน';
    }
  }
  items.push({
    step: 1,
    title: 'Context',
    fact: `H4=${h4Bull ? 'Bull' : h4Bear ? 'Bear' : 'Mixed'} (EMA20=${lastH4EMA20.toFixed(config.decimals)}, EMA50=${lastH4EMA50.toFixed(config.decimals)}) · H1=${h1Bull ? 'Bull' : h1Bear ? 'Bear' : 'Mixed'} · Narrative=${config.hasClearNarrative ? 'มี' : 'ไม่มี'}`,
    inference: step1Inference,
    status: step1Status,
  });

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
  let step3Status: ChecklistItemResult['status'] = 'fail';
  let step3Inference = '';
  let step3Fact = '';
  const refIndex = triggerEval ? triggerEval.triggerIndex : closedLTF.length - 1;
  if (closedLTF.length >= 26 && refIndex >= 25 && level !== null) {
    const prior5 = closedLTF.slice(refIndex - 5, refIndex);
    const prior20 = closedLTF.slice(refIndex - 25, refIndex - 5);

    const avgRange5 = prior5.reduce((sum, c) => sum + (c.high - c.low), 0) / 5;
    const avgRange20 = prior20.reduce((sum, c) => sum + (c.high - c.low), 0) / 20;

    const avgVol5 = prior5.reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
    const avgVol20 = prior20.reduce((sum, c) => sum + (c.volume || 0), 0) / 20;

    const rangeCompressed = avgRange5 < avgRange20;
    const volCompressed = avgVol5 < avgVol20;

    const distToLine = Math.min(...prior5.map(c => Math.abs(c.close - level)));
    const nearLine = distToLine <= 1.0 * lastLtfATR;

    step3Fact = `Range 5บาร์=${avgRange5.toFixed(config.decimals)} (vs 20บาร์=${avgRange20.toFixed(config.decimals)}) · Vol 5บาร์=${Math.round(avgVol5)} (vs 20บาร์=${Math.round(avgVol20)}) · ห่างเส้น=${distToLine.toFixed(config.decimals)} (1×ATR=${lastLtfATR.toFixed(config.decimals)})`;

    if (rangeCompressed && volCompressed && nearLine) {
      step3Status = 'pass';
      step3Inference = 'Range & Vol บีบตัวต่ำกว่า 20 บาร์ก่อนหน้า + เกาะชิดเส้น';
    } else {
      step3Status = 'fail';
      step3Inference = 'ยังไม่เกิดการบีบตัว (Compression) ก่อนถึงเส้น';
    }
  } else {
    step3Fact = 'ข้อมูลแท่งเทียนไม่เพียงพอ (ต้องการอย่างน้อย 26 แท่งปิด)';
    step3Inference = 'ยังไม่สามารถตรวจวัด Compression';
    step3Status = 'unknown';
  }
  items.push({
    step: 3,
    title: 'Compression',
    fact: step3Fact,
    inference: step3Inference,
    status: step3Status,
  });

  // --- Step 4: Trigger ---
  let step4Status: ChecklistItemResult['status'] = 'fail';
  let step4Inference = '';
  let step4Fact = '';
  if (triggerEval) {
    const triggerTime = new Date(triggerEval.triggerCandle.time * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    step4Fact = `แท่ง ${triggerTime} (ย้อนหลัง ${triggerEval.barsAgo} บาร์) ปิด=${triggerEval.triggerCandle.close.toFixed(config.decimals)} · Vol=${triggerEval.volumeRatio}× เฉลี่ย 20`;
    if (triggerEval.isShortCoveringWarning) {
      step4Status = 'warn';
      step4Inference = 'อาจแค่ short covering (แท่งเขียวปิดไม่เกิน open ของแท่งแดงก่อนหน้า)';
    } else {
      step4Status = 'pass';
      step4Inference = `เข้าเงื่อนไข Trigger ทะลุเส้นปิด ${side === 'bull' ? 'เหนือ' : 'ใต้'}เส้น และ Vol >= 2×`;
    }
  } else {
    step4Fact = `ย้อนหลัง 10 แท่งปิดล่าสุด ไม่มีแท่งที่ปิดทะลุเส้น ${level !== null ? level.toFixed(config.decimals) : '-'} พร้อม Vol >= 2×`;
    step4Inference = 'ยังไม่พบแท่ง Trigger (ไส้ทะลุแต่เนื้อไม่ปิดข้ามเส้นไม่นับ)';
    step4Status = 'fail';
  }
  items.push({
    step: 4,
    title: 'Trigger',
    fact: step4Fact,
    inference: step4Inference,
    status: step4Status,
  });

  // --- Step 5, 6, 8: Entry, Stop, R/R Calculation ---
  let entryPrice: number | null = null;
  let stopPrice: number | null = null;
  let riskAmount: number | null = null;
  let target3R: number | null = null;
  let actualRR: number | null = null;

  if (level !== null && level > 0) {
    const triggerCandle = triggerEval ? triggerEval.triggerCandle : lastClosed;
    const triggerClose = triggerCandle ? triggerCandle.close : level;
    const triggerLow = triggerCandle ? triggerCandle.low : level;
    const triggerHigh = triggerCandle ? triggerCandle.high : level;

    // Entry Price
    if (config.entryMode === 'immediate') {
      entryPrice = side === 'bull' ? triggerClose + config.buffer : triggerClose - config.buffer;
    } else {
      entryPrice = side === 'bull' ? level + config.buffer : level - config.buffer;
    }

    // Stop Price
    if (config.stopMode === 'beyond_line') {
      stopPrice = side === 'bull' ? level - config.buffer : level + config.buffer;
    } else {
      stopPrice = side === 'bull' ? triggerLow - config.buffer : triggerHigh + config.buffer;
    }

    riskAmount = Math.abs(entryPrice - stopPrice);
    target3R = side === 'bull' ? entryPrice + 3 * riskAmount : entryPrice - 3 * riskAmount;

    const realTarget = side === 'bull' ? config.targetBull : config.targetBear;
    if (realTarget !== null && realTarget > 0 && riskAmount > 0) {
      const reward = Math.abs(realTarget - entryPrice);
      actualRR = Number((reward / riskAmount).toFixed(2));
    }
  }

  // --- Step 5: Entry ---
  let step5Status: ChecklistItemResult['status'] = 'pass';
  let step5Inference = '';
  if (entryPrice !== null) {
    if (actualRR === null) {
      step5Status = 'unknown';
      step5Inference = `Entry=${entryPrice.toFixed(config.decimals)} (กรุณาระบุเป้าจริงเพื่อคำนวณ R:R)`;
    } else if (actualRR < 3.0) {
      step5Status = 'fail';
      step5Inference = `ไม่เข้าเกณฑ์ (R:R จริง=${actualRR} < 3)`;
    } else {
      step5Status = 'pass';
      step5Inference = `เข้าเกณฑ์ (R:R จริง=${actualRR} >= 3)`;
    }
  } else {
    step5Status = 'fail';
    step5Inference = 'ยังไม่มีจุดเข้า';
  }
  items.push({
    step: 5,
    title: 'Entry',
    fact: `โหมด=${config.entryMode === 'immediate' ? 'ทะลุทันที' : 'Retest'} · จุดเข้า=${entryPrice ? entryPrice.toFixed(config.decimals) : '-'} · Buffer=${config.buffer}`,
    inference: step5Inference,
    status: step5Status,
  });

  // --- Step 6: Stop ---
  let step6Status: ChecklistItemResult['status'] = 'pass';
  let step6Inference = '';
  if (stopPrice !== null && entryPrice !== null && riskAmount !== null) {
    step6Status = 'pass';
    step6Inference = `Stop ที่ ${stopPrice.toFixed(config.decimals)} (ระยะ Risk=${riskAmount.toFixed(config.decimals)})`;
  } else {
    step6Status = 'fail';
    step6Inference = 'ยังไม่สามารถคำนวณ Stop Loss';
  }
  items.push({
    step: 6,
    title: 'Stop',
    fact: `โหมด=${config.stopMode === 'beyond_line' ? 'ใต้/เหนือเส้น' : 'ใต้/เหนือแท่ง breakout'} · ราคา Stop=${stopPrice ? stopPrice.toFixed(config.decimals) : '-'}`,
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
    const risk = riskAmount || 1;
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
  items.push({
    step: 8,
    title: 'R/R & เป้าหมาย',
    fact: `Risk=${riskAmount ? riskAmount.toFixed(config.decimals) : '-'} · ราคาที่ 3R=${target3R ? target3R.toFixed(config.decimals) : '-'} · R:R เป้าจริง=${actualRR !== null ? `1 : ${actualRR}` : 'ยังไม่ระบุเป้าจริง'}`,
    inference: actualRR !== null
      ? actualRR >= 3.0
        ? 'R:R คุ้มค่าต่อความเสี่ยง (>= 3R)'
        : 'R:R ไม่คุ้มค่าความเสี่ยง (< 3R)'
      : 'กรุณาระบุเป้าหมายจริงเพื่อคำนวณอัตราผลตอบแทนต่อความเสี่ยง',
    status: actualRR !== null ? (actualRR >= 3.0 ? 'pass' : 'fail') : 'unknown',
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
