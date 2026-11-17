import { Candle } from '../types/trading';
import { calculateRSIValues, filterClosedCandles } from './breakoutScalp';
import { hasMarketClose } from './assetRegistry';

export type EntryTierId = 0 | 1 | 2 | 3;
export type ActiveTierId = 1 | 2 | 3;

export interface TierChecklistDef {
  id: string;
  label: string;
  detail: string;
  onlyWhenLowProbe?: boolean;
}

export interface TierTradeState {
  tier: ActiveTierId;
  signals: string[];
  entryPrice: number | null;
  stopPrice: number | null;
  takeProfitPrice: number | null;
  tp1Price: number | null;
  checklist: Record<string, boolean>;
  htfConfirmed: boolean; // Tier 1: Daily confirmed (for upgrade to 2); Tier 2: Weekly confirmed (for upgrade to 3)
  isLowProbe: boolean; // Tier 1 only: "ไม้ทดลองที่ low"
  probeReentryCount: number; // Tier 1 low probe: count of new trades after SL + bounce
  enteredAt: number | null; // Independent entry timestamp (ms) for this tier's time stop
  marketCloseTime: string; // HH:MM (24h) user-configurable
  note: string;
}

export type AssetTiersMap = Record<string, Record<ActiveTierId, TierTradeState>>;

export const ENTRY_TIERS_STORAGE_KEY = 'apextrade_entry_tiers_v1';

export const PRESET_SIGNALS: string[] = [
  'RSI Daily',
  'EMA Cross / โครงสร้าง',
  'Volume ยืนยัน',
  'แนวรับ / แนวต้าน',
  'Divergence',
  'Breakout โครงสร้าง H1/H4',
  'Dow Theory Higher Low',
];

export const TIER_CHECKLISTS: Record<ActiveTierId, TierChecklistDef[]> = {
  1: [
    {
      id: 't1_fund_not_against',
      label: 'Fundamental ไม่สวนทาง',
      detail: 'ทิศทางพื้นฐานไม่ขัดกับฝั่งที่เข้า (หากข้อมูลไม่ครบ/ข่าวไม่เป็นใจ → เริ่มที่ระยะ 1 ด้วยไม้เล็กสุด)',
    },
    {
      id: 't1_tf_aligned',
      label: 'เช็คครบ 3 TF: Daily (บริบท) / H4 (โครงสร้าง) / H1 (Trigger)',
      detail: 'บริบท Daily, โครงสร้าง H4 และแท่ง Trigger บน H1 สอดคล้องกัน',
    },
    {
      id: 't1_macro_news',
      label: 'เช็คข่าว CPI / NFP / FOMC ก่อนเข้าแล้ว',
      detail: 'ตรวจสอบตารางข่าวสำคัญก่อนเปิดสถานะ เพื่อหลีกเลี่ยงความผันผวนฉับพลัน',
    },
    {
      id: 't1_hard_sl',
      label: 'ตั้ง Hard SL พ้น Noise ด้วย Indicator และไม่ Average Down',
      detail: 'SL ใกล้จุดเข้าที่สุดโดยอิง Indicator ให้พ้น Noise และห้ามถัวเฉลี่ยตอนราคากำลังร่วง',
    },
    {
      id: 't1_probe_near_low',
      label: '[ไม้ทดลองที่ low] ราคาที่/ใกล้ Low + RSI Daily ใกล้ 30 (ดุลพินิจ)',
      detail: 'เข้าไม้เล็กสุดเมื่อราคาทดสอบ Low และ RSI Daily อยู่โซนโอกาส Rebound',
      onlyWhenLowProbe: true,
    },
    {
      id: 't1_probe_sl_at_low',
      label: '[ไม้ทดลองที่ low] ตั้ง SL ที่ Low (โดน SL แล้ววกกลับ = นับเป็นเทรดใหม่)',
      detail: 'SL ชิด Low และหากโดน SL แล้ววกกลับ สามารถเข้าใหม่โดยวาง SL ใกล้ Low ใหม่',
      onlyWhenLowProbe: true,
    },
  ],
  2: [
    {
      id: 't2_entry_like_t1',
      label: 'ผ่านเกณฑ์เข้าแบบระยะ 1 (Technical ≥ 2, Fund ไม่สวน, เช็คข่าวแล้ว)',
      detail: 'จุดเริ่มต้นต้องมีวินัยครบเหมือนระยะ 1 ทุกประการ',
    },
    {
      id: 't2_daily_confirm',
      label: 'Daily ยืนยันให้ถือต่อ',
      detail: 'แท่ง/โครงสร้าง Daily ยืนยันทิศทาง จึงถือต่อเกินกรอบระยะสั้นได้',
    },
    {
      id: 't2_no_invalidation',
      label: 'ไม่มีสัญญาณ Invalidation',
      detail: 'ยังไม่เสียโครงสร้างราคาหรือมีปัจจัยหักล้างเงื่อนไขที่เข้า',
    },
    {
      id: 't2_hard_sl',
      label: 'มี Hard SL พ้น Noise และไม่ Average Down',
      detail: 'คง Hard SL ไว้ตลอดเวลา และห้ามถัวเฉลี่ยขาลง',
    },
    {
      id: 't2_tp1_discretion',
      label: 'ประเมิน TP1 แล้ว (ปิดบางส่วนที่ TP1 หรือไม่ = ดุลพินิจ)',
      detail: 'ตัดสินใจล่วงหน้าว่าจะแบ่งปิดที่ TP1 หรือถือต่อตามโครงสร้าง Daily',
    },
  ],
  3: [
    {
      id: 't3_all_layers',
      label: 'สัญญาณครบทุกชั้น (Macro, Smart Money, Options, Weekly + Daily)',
      detail: 'ภาพใหญ่และฟันด์โฟลว์ทุกชั้นสอดคล้องกันทั้ง Weekly และ Daily',
    },
    {
      id: 't3_fair_price',
      label: 'ราคาเหมาะสม — ไม่ไล่ราคาตอนขึ้น/ลงแรง',
      detail: 'รอราคาอยู่ในโซนเหมาะสม ไม่ FOMO ไล่แท่งพุ่งแรง',
    },
    {
      id: 't3_dow_sl',
      label: 'Hard SL อิง Higher Low ของ Weekly/Daily ตาม Dow Theory',
      detail: 'วาง SL ตามโครงสร้าง Dow Theory บน TF Weekly หรือ Daily (ไม่ Average Down)',
    },
  ],
};

export function createDefaultTierState(tier: ActiveTierId): TierTradeState {
  return {
    tier,
    signals: [],
    entryPrice: null,
    stopPrice: null,
    takeProfitPrice: null,
    tp1Price: null,
    checklist: {},
    htfConfirmed: false,
    isLowProbe: false,
    probeReentryCount: 0,
    enteredAt: null,
    marketCloseTime: '04:00',
    note: '',
  };
}

export function createDefaultAssetTiers(): Record<ActiveTierId, TierTradeState> {
  return {
    1: createDefaultTierState(1),
    2: createDefaultTierState(2),
    3: createDefaultTierState(3),
  };
}

export function loadEntryTiersState(symbols: string[]): AssetTiersMap {
  const result: AssetTiersMap = {};
  let parsed: Record<string, any> = {};
  try {
    const raw = localStorage.getItem(ENTRY_TIERS_STORAGE_KEY);
    if (raw) {
      parsed = JSON.parse(raw) || {};
    }
  } catch {}

  for (const sym of symbols) {
    const savedAsset = parsed[sym] || {};
    result[sym] = {
      1: { ...createDefaultTierState(1), ...(savedAsset[1] || {}), tier: 1 },
      2: { ...createDefaultTierState(2), ...(savedAsset[2] || {}), tier: 2 },
      3: { ...createDefaultTierState(3), ...(savedAsset[3] || {}), tier: 3 },
    };
  }
  return result;
}

export function saveEntryTiersState(state: AssetTiersMap): void {
  try {
    localStorage.setItem(ENTRY_TIERS_STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export interface DailyRsiEvaluation {
  available: boolean;
  rsi: number | null;
  zone: 'rebound_zone' | 'resistance_zone' | 'weak_middle' | 'insufficient';
  zoneLabel: string;
  rangeNote: string;
}

export function evaluateDailyRsi(d1Candles: Candle[]): DailyRsiEvaluation {
  const closedD1 = filterClosedCandles(d1Candles, 86400);
  if (closedD1.length < 15) {
    return {
      available: false,
      rsi: null,
      zone: 'insufficient',
      zoneLabel: `ข้อมูล Daily ไม่พอ (${closedD1.length}/15 แท่ง)`,
      rangeNote: 'ช่วงปกติ 30–70',
    };
  }
  const closes = closedD1.map(c => c.close);
  const rsiArr = calculateRSIValues(closes, 14);
  if (rsiArr.length === 0) {
    return {
      available: false,
      rsi: null,
      zone: 'insufficient',
      zoneLabel: 'คำนวณ RSI Daily ไม่ได้',
      rangeNote: 'ช่วงปกติ 30–70',
    };
  }
  const rsi = Number(rsiArr[rsiArr.length - 1].toFixed(1));
  if (rsi <= 30) {
    return {
      available: true,
      rsi,
      zone: 'rebound_zone',
      zoneLabel: 'ต่ำกว่า/เท่ากับ 30 — โซนโอกาส Rebound',
      rangeNote: 'ช่วงปกติ 30–70',
    };
  }
  if (rsi >= 70) {
    return {
      available: true,
      rsi,
      zone: 'resistance_zone',
      zoneLabel: 'เกิน/เท่ากับ 70 — โซนติดแนวต้าน',
      rangeNote: 'ช่วงปกติ 30–70',
    };
  }
  return {
    available: true,
    rsi,
    zone: 'weak_middle',
    zoneLabel: 'กลางช่วง 30–70 — สัญญาณอ่อน',
    rangeNote: 'ช่วงปกติ 30–70',
  };
}

export interface TierRrEvaluation {
  valid: boolean;
  directionLabel: string | null;
  risk: number | null;
  reward: number | null;
  rrRatio: number | null;
  meetsMinimum3: boolean;
  errorMessage: string | null;
}

export function evaluateTierRR(
  entry: number | null,
  sl: number | null,
  tp: number | null
): TierRrEvaluation {
  if (entry === null || sl === null || tp === null || isNaN(entry) || isNaN(sl) || isNaN(tp)) {
    return {
      valid: false,
      directionLabel: null,
      risk: null,
      reward: null,
      rrRatio: null,
      meetsMinimum3: false,
      errorMessage: 'กรุณากรอก ราคาเข้า, SL และ TP ให้ครบเพื่อคำนวณ R/R',
    };
  }

  if (entry <= 0 || sl <= 0 || tp <= 0) {
    return {
      valid: false,
      directionLabel: null,
      risk: null,
      reward: null,
      rrRatio: null,
      meetsMinimum3: false,
      errorMessage: 'ราคาต้องมากกว่า 0',
    };
  }

  if (entry === sl) {
    return {
      valid: false,
      directionLabel: null,
      risk: 0,
      reward: null,
      rrRatio: null,
      meetsMinimum3: false,
      errorMessage: 'SL กับราคาเข้าเท่ากัน (Risk = 0) — ต้องมี Hard SL พ้น Noise',
    };
  }

  // Signed direction inferred solely from Entry vs SL (no Buy/Sell recommendation)
  const dir = entry > sl ? 1 : -1;
  const directionLabel = dir === 1 ? 'ฝั่งขึ้น (SL ต่ำกว่าราคาเข้า)' : 'ฝั่งลง (SL สูงกว่าราคาเข้า)';
  const risk = (entry - sl) * dir;
  const reward = (tp - entry) * dir;

  if (reward <= 0) {
    return {
      valid: false,
      directionLabel,
      risk,
      reward,
      rrRatio: null,
      meetsMinimum3: false,
      errorMessage: 'TP อยู่ฝั่งเดียวกับ SL (อยู่ผิดฝั่งราคาเข้า)',
    };
  }

  const rrRatio = Number((reward / risk).toFixed(2));
  const meetsMinimum3 = rrRatio >= 3.0;

  return {
    valid: true,
    directionLabel,
    risk,
    reward,
    rrRatio,
    meetsMinimum3,
    errorMessage: meetsMinimum3 ? null : `R/R = 1 : ${rrRatio} ต่ำกว่าเกณฑ์ขั้นต่ำ 1 : 3`,
  };
}

export interface TierTimeStopStatus {
  isRunning: boolean;
  elapsedMs: number;
  elapsedText: string;
  severity: 'idle' | 'ok' | 'warn' | 'critical';
  headline: string;
  warnings: string[];
  msToMarketClose: number | null;
}

export function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) {
    return `${days} วัน ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getMsUntilNextMarketClose(nowMs: number, marketCloseTime: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((marketCloseTime || '').trim());
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

  const now = new Date(nowMs);
  const target = new Date(nowMs);
  target.setHours(hh, mm, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
}

export function hasMarketCloseSession(symbol: string): boolean {
  return hasMarketClose(symbol);
}

export function evaluateTierTimeStop(
  tier: ActiveTierId,
  enteredAt: number | null,
  marketCloseTime: string,
  nowMs: number,
  hasMarketClose: boolean = true
): TierTimeStopStatus {
  const msToClose = hasMarketClose ? getMsUntilNextMarketClose(nowMs, marketCloseTime) : null;

  if (!enteredAt) {
    const defaultHeadline =
      tier === 1
        ? hasMarketClose
          ? 'ยังไม่เริ่มนับเวลา (ปกติปิดใน 24 ชม. / สูงสุดไม่เกิน 5 วันและก่อนตลาดปิด)'
          : 'ยังไม่เริ่มนับเวลา (ปกติปิดใน 24 ชม. / สูงสุดไม่เกิน 5 วัน)'
        : tier === 2
        ? 'ยังไม่เริ่มนับเวลา (ถือต่อเมื่อ Daily ยืนยัน + ไม่มี Invalidation)'
        : 'ยังไม่เริ่มนับเวลา (ถือตามโครงสร้าง Weekly/Daily)';
    return {
      isRunning: false,
      elapsedMs: 0,
      elapsedText: '00:00:00',
      severity: 'idle',
      headline: defaultHeadline,
      warnings: [],
      msToMarketClose: msToClose,
    };
  }

  const elapsedMs = Math.max(0, nowMs - enteredAt);
  const elapsedText = formatDurationMs(elapsedMs);
  const warnings: string[] = [];

  if (tier === 1) {
    const H24 = 24 * 3600 * 1000;
    const D4 = 4 * 24 * 3600 * 1000;
    const D5 = 5 * 24 * 3600 * 1000;
    const NEAR_CLOSE_MS = 90 * 60 * 1000; // 1.5 hours before market close

    let severity: TierTimeStopStatus['severity'] = 'ok';
    let headline = 'อยู่ในกรอบเวลาปกติ (≤ 24 ชม.)';

    if (elapsedMs >= D5) {
      severity = 'critical';
      headline = 'เกินขีดจำกัด 5 วันของระยะ 1 แล้ว!';
      warnings.push('เตือนหนัก: ถือเกิน 5 วันแล้ว (เกิน Time Stop สูงสุดของระยะ 1)');
    } else if (elapsedMs >= D4) {
      severity = 'critical';
      headline = 'ใกล้ครบ 5 วันแล้ว — เตรียมปิดก่อนครบกำหนด';
      warnings.push('เตือนหนัก: ถือใกล้ครบ 5 วันแล้ว (ระยะ 1 ห้ามเกิน 5 วัน)');
    } else if (elapsedMs >= H24) {
      severity = 'warn';
      headline = 'ครบ 24 ชม. แล้ว — ปกติควรปิดสถานะ';
      warnings.push(
        hasMarketClose
          ? 'ครบ 24 ชม. แล้ว: ปกติปิดใน 24 ชม. (ถือเกินได้ไม่เกิน 5 วันและก่อนตลาดปิด)'
          : 'ครบ 24 ชม. แล้ว: ปกติปิดใน 24 ชม. (ถือเกินได้ไม่เกิน 5 วัน)'
      );
    }

    if (hasMarketClose && msToClose !== null && msToClose <= NEAR_CLOSE_MS) {
      severity = 'critical';
      const minsLeft = Math.max(1, Math.ceil(msToClose / 60000));
      warnings.push(`เตือนหนัก: ใกล้เวลาตลาดปิด (${marketCloseTime}) ในอีก ${minsLeft} นาที`);
    }

    return {
      isRunning: true,
      elapsedMs,
      elapsedText,
      severity,
      headline,
      warnings,
      msToMarketClose: msToClose,
    };
  }

  if (tier === 2) {
    return {
      isRunning: true,
      elapsedMs,
      elapsedText,
      severity: 'ok',
      headline: 'กำลังถือในระยะ 2 (กลาง) — ตรวจ Daily ยืนยันและ Invalidation สม่ำเสมอ',
      warnings,
      msToMarketClose: msToClose,
    };
  }

  return {
    isRunning: true,
    elapsedMs,
    elapsedText,
    severity: 'ok',
    headline: 'กำลังถือในระยะ 3 (ยาว) — ถือตามโครงสร้าง Weekly/Daily (Dow Theory)',
    warnings,
    msToMarketClose: msToClose,
  };
}
