import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Candle } from '../types/trading';
import {
  ActiveTierId,
  PRESET_SIGNALS,
  TIER_CHECKLISTS,
  TierTradeState,
  evaluateDailyRsi,
  evaluateTierRR,
  evaluateTierTimeStop,
  formatDurationMs,
  hasMarketCloseSession,
} from '../services/entryTiers';
import { aggregateDailyToWeekly, fetchBinanceKlines } from '../services/marketData';
import { EntryTierChart, PricePickMode, TierChartTimeframe } from './EntryTierChart';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ArrowUpCircle,
  Plus,
  X,
  RotateCcw,
  Play,
  Square,
  Activity,
  Shield,
  Info,
} from 'lucide-react';

interface EntryTiersPanelProps {
  symbol: string;
  thaiName: string;
  source: 'Binance' | 'Yahoo';
  decimals: number;
  activeTier: ActiveTierId;
  tierState: TierTradeState;
  latestPrice: number | null;
  h1Candles: Candle[];
  h4Candles: Candle[];
  d1Candles: Candle[];
  isCandlesLoading?: boolean;
  onUpdateTierState: (updater: (prev: TierTradeState) => TierTradeState) => void;
  onUpgradeTier: (fromTier: ActiveTierId, toTier: ActiveTierId) => void;
}

const TIER_META: Record<ActiveTierId, { name: string; subtitle: string; tfRule: string }> = {
  1: {
    name: 'ระยะ 1: สั้น (≤ 1 สัปดาห์)',
    subtitle: 'Technical ≥ 2 สัญญาณ + Fundamental ไม่สวน · ปกติปิดใน 24 ชม. (สูงสุด 5 วันและก่อนตลาดปิด)',
    tfRule: 'Daily (บริบท) / H4 (โครงสร้าง) / H1 (Trigger)',
  },
  2: {
    name: 'ระยะ 2: กลาง',
    subtitle: 'เข้าเหมือนระยะ 1 ถือต่อเมื่อ Daily ยืนยัน + ไม่มี Invalidation · ปิดบางส่วนที่ TP1 = ดุลพินิจ',
    tfRule: 'Daily ยืนยันต่อเนื่อง (อัปเกรดมาจากระยะ 1)',
  },
  3: {
    name: 'ระยะ 3: ยาว',
    subtitle: 'สัญญาณครบทุกชั้น (Macro, Smart Money, Options, Weekly+Daily) + ราคาเหมาะสม ไม่ไล่ราคา',
    tfRule: 'Weekly + Daily (SL อิง Higher Low ตาม Dow Theory)',
  },
};

export const EntryTiersPanel: React.FC<EntryTiersPanelProps> = ({
  symbol,
  thaiName,
  source,
  decimals,
  activeTier,
  tierState,
  latestPrice,
  h1Candles,
  h4Candles,
  d1Candles,
  isCandlesLoading = false,
  onUpdateTierState,
  onUpgradeTier,
}) => {
  const [signalInput, setSignalInput] = useState('');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [chartTf, setChartTf] = useState<TierChartTimeframe>('1d');
  const [w1Candles, setW1Candles] = useState<Candle[]>([]);
  const [isWeeklyLoading, setIsWeeklyLoading] = useState<boolean>(false);

  const activeChartRequestRef = useRef<{ symbol: string; chartTf: TierChartTimeframe }>({
    symbol,
    chartTf,
  });
  activeChartRequestRef.current = { symbol, chartTf };

  // Available chart timeframes: Daily / H4 / H1 (Tier 3 adds Weekly)
  const availableTimeframes = useMemo<TierChartTimeframe[]>(
    () => (activeTier === 3 ? ['1w', '1d', '4h', '1h'] : ['1d', '4h', '1h']),
    [activeTier]
  );

  // If leaving Tier 3 while on '1w', reset to '1d'
  useEffect(() => {
    if (activeTier !== 3 && chartTf === '1w') {
      setChartTf('1d');
    }
  }, [activeTier, chartTf]);

  // Clear Weekly candles immediately when symbol changes
  useEffect(() => {
    setW1Candles([]);
  }, [symbol]);

  // Fetch Weekly candles when Tier 3 selects Weekly chart TF
  useEffect(() => {
    if (activeTier !== 3 || chartTf !== '1w') return;
    const reqSymbol = symbol;
    setIsWeeklyLoading(true);

    const loadWeekly = async () => {
      try {
        let fetched: Candle[] = [];
        if (source === 'Binance') {
          fetched = await fetchBinanceKlines(reqSymbol, '1w');
        } else {
          const res = await fetch(`/api/klines?symbol=${encodeURIComponent(reqSymbol)}&timeframe=1w`);
          if (res.ok) {
            const data = await res.json();
            fetched = data.candles || [];
          }
        }
        if (activeChartRequestRef.current.symbol !== reqSymbol) return;
        if (fetched.length > 0) {
          setW1Candles(fetched);
        } else {
          setW1Candles(aggregateDailyToWeekly(d1Candles));
        }
      } catch {
        if (activeChartRequestRef.current.symbol !== reqSymbol) return;
        setW1Candles(aggregateDailyToWeekly(d1Candles));
      } finally {
        if (activeChartRequestRef.current.symbol === reqSymbol) {
          setIsWeeklyLoading(false);
        }
      }
    };

    loadWeekly();
  }, [activeTier, chartTf, symbol, source, d1Candles]);

  const activeChartCandles = useMemo(() => {
    if (chartTf === '1w') return w1Candles.length > 0 ? w1Candles : aggregateDailyToWeekly(d1Candles);
    if (chartTf === '1d') return d1Candles;
    if (chartTf === '4h') return h4Candles;
    return h1Candles;
  }, [chartTf, w1Candles, d1Candles, h4Candles, h1Candles]);

  const handlePickPriceFromChart = (mode: Exclude<PricePickMode, null>, price: number) => {
    const rounded = Number(price.toFixed(decimals));
    onUpdateTierState(prev => ({
      ...prev,
      entryPrice: mode === 'entry' ? rounded : prev.entryPrice,
      stopPrice: mode === 'sl' ? rounded : prev.stopPrice,
      takeProfitPrice: mode === 'tp' ? rounded : prev.takeProfitPrice,
    }));
  };

  const handleClearAllLines = () => {
    onUpdateTierState(prev => ({
      ...prev,
      entryPrice: null,
      stopPrice: null,
      takeProfitPrice: null,
      tp1Price: null,
    }));
  };

  // Independent 1-second tick for the current tier's time stop display
  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [symbol, activeTier]);

  const meta = TIER_META[activeTier];
  const showMarketClose = hasMarketCloseSession(symbol);
  const dailyRsi = useMemo(() => evaluateDailyRsi(d1Candles), [d1Candles]);
  const rrEval = useMemo(
    () => evaluateTierRR(tierState.entryPrice, tierState.stopPrice, tierState.takeProfitPrice),
    [tierState.entryPrice, tierState.stopPrice, tierState.takeProfitPrice]
  );
  const timeStop = useMemo(
    () => evaluateTierTimeStop(activeTier, tierState.enteredAt, tierState.marketCloseTime, nowMs, showMarketClose),
    [activeTier, tierState.enteredAt, tierState.marketCloseTime, nowMs, showMarketClose]
  );

  const visibleChecklist = useMemo(() => {
    return TIER_CHECKLISTS[activeTier].filter(
      item => !item.onlyWhenLowProbe || (activeTier === 1 && tierState.isLowProbe)
    );
  }, [activeTier, tierState.isLowProbe]);

  const signalsPass = tierState.signals.length >= 2;
  const rrPass = rrEval.valid && rrEval.meetsMinimum3;

  const handleAddSignal = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (tierState.signals.includes(trimmed)) {
      setSignalInput('');
      return;
    }
    onUpdateTierState(prev => ({
      ...prev,
      signals: [...prev.signals, trimmed],
    }));
    setSignalInput('');
  };

  const handleTogglePresetSignal = (sig: string) => {
    onUpdateTierState(prev => {
      const exists = prev.signals.includes(sig);
      return {
        ...prev,
        signals: exists ? prev.signals.filter(s => s !== sig) : [...prev.signals, sig],
      };
    });
  };

  const handleRemoveSignal = (sig: string) => {
    onUpdateTierState(prev => ({
      ...prev,
      signals: prev.signals.filter(s => s !== sig),
    }));
  };

  const handleToggleChecklist = (id: string) => {
    onUpdateTierState(prev => ({
      ...prev,
      checklist: {
        ...prev.checklist,
        [id]: !prev.checklist[id],
      },
    }));
  };

  const handleStartEntryTimer = () => {
    onUpdateTierState(prev => ({
      ...prev,
      enteredAt: Date.now(),
    }));
  };

  const handleResetEntryTimer = () => {
    onUpdateTierState(prev => ({
      ...prev,
      enteredAt: null,
    }));
  };

  const handleProbeReentry = () => {
    onUpdateTierState(prev => ({
      ...prev,
      enteredAt: null,
      probeReentryCount: (prev.probeReentryCount || 0) + 1,
    }));
  };

  const canUpgrade = activeTier < 3;
  const nextTier = (activeTier + 1) as ActiveTierId;
  const upgradeGateLabel =
    activeTier === 1
      ? 'ยืนยันแล้วว่า TF Daily ยืนยัน (เงื่อนไขอัปเกรดไประยะ 2)'
      : 'ยืนยันแล้วว่า TF Weekly ยืนยัน (เงื่อนไขอัปเกรดไประยะ 3)';

  return (
    <div className="space-y-4 text-xs text-slate-100">
      {/* Header & Global Discipline Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-white">{symbol}</span>
              <span className="text-xs text-slate-400">({thaiName})</span>
              <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold text-xs">
                {meta.name}
              </span>
              {latestPrice !== null && (
                <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 font-mono text-slate-300">
                  ราคาล่าสุด: {latestPrice.toFixed(decimals)}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {activeTier === 1 && !showMarketClose
                ? 'Technical ≥ 2 สัญญาณ + Fundamental ไม่สวน · ปกติปิดใน 24 ชม. (สูงสุด 5 วัน)'
                : meta.subtitle}
            </p>
            <p className="text-[11px] text-cyan-400 font-mono mt-0.5">กรอบ TF: {meta.tfRule}</p>
          </div>

          {/* Tier 1 Only: "ไม้ทดลองที่ low" toggle */}
          {activeTier === 1 && (
            <div className="flex flex-col items-end gap-1.5">
              <label
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all font-bold ${
                  tierState.isLowProbe
                    ? 'bg-indigo-500/20 border-indigo-400 text-indigo-200'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={tierState.isLowProbe}
                  onChange={e =>
                    onUpdateTierState(prev => ({
                      ...prev,
                      isLowProbe: e.target.checked,
                    }))
                  }
                  className="rounded accent-indigo-400 w-4 h-4 cursor-pointer"
                />
                <span>ไม้ทดลองที่ low</span>
              </label>
              {tierState.isLowProbe && (
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-slate-400 font-mono">
                    นับเทรดใหม่หลัง SL: {tierState.probeReentryCount} ครั้ง
                  </span>
                  <button
                    onClick={handleProbeReentry}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 cursor-pointer"
                    title="โดน SL แล้ววกกลับ → เข้าใหม่ได้ SL ใกล้ low ใหม่ (นับเป็นเทรดใหม่)"
                  >
                    โดน SL แล้ววกกลับ (เทรดใหม่)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Core Discipline Rules Summary */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-300">
          <span className="flex items-center gap-1 text-amber-400 font-bold">
            <Shield className="w-3.5 h-3.5" />
            <span>กฎวินัยกลาง:</span>
          </span>
          <span>ขนาดไม้ = ดุลพินิจผู้ใช้ (ข้อมูลน้อย → ไม้เล็กสุด)</span>
          <span>·</span>
          <span>Hard SL เสมอ + ไม่ Average Down ตอนราคากำลังร่วง</span>
          <span>·</span>
          <span>R/R ขั้นต่ำ 1:3</span>
          <span>·</span>
          <span>ข้อมูลไม่ครบ/ข่าวไม่เป็นใจ → เริ่มระยะ 1 ก่อน</span>
        </div>

        {/* RSI Daily Context Box */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <span className="font-bold text-slate-200 mr-2">RSI (Daily 14):</span>
              <span className="font-mono font-bold text-sm text-white">
                {dailyRsi.available && dailyRsi.rsi !== null ? dailyRsi.rsi.toFixed(1) : '-'}
              </span>
              <span className="text-[11px] text-slate-400 ml-2">({dailyRsi.rangeNote})</span>
            </div>
          </div>

          <span
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
              dailyRsi.zone === 'rebound_zone'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                : dailyRsi.zone === 'resistance_zone'
                ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                : dailyRsi.zone === 'weak_middle'
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {dailyRsi.zoneLabel}
          </span>
        </div>

        {activeTier === 1 && tierState.isLowProbe && (
          <div className="bg-indigo-950/40 border border-indigo-700/50 rounded-lg p-2.5 text-[11px] text-indigo-200 flex items-start gap-2">
            <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <span>
              <strong>โหมดไม้ทดลองที่ low:</strong> ราคาที่/ใกล้ Low + RSI Daily ใกล้ 30 → ใช้ไม้เล็กสุด และวาง Hard SL ที่ Low ·
              หากโดน SL แล้ววกกลับ สามารถเข้าใหม่โดยวาง SL ใกล้ Low ใหม่ (นับเป็นเทรดใหม่ ไม่ใช่การถัวเฉลี่ย)
            </span>
          </div>
        )}
      </div>

      {/* Main 2-column Grid: Left = Chart, Inputs & Time Stop, Right = Checklist & Upgrade */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column (7 cols): Candlestick Chart, Signals, Entry/SL/TP + Auto R/R, Independent Time Stop */}
        <div className="lg:col-span-7 space-y-4">
          {/* Interactive Candlestick Chart for Setting Entry / SL / TP */}
          <EntryTierChart
            symbol={symbol}
            decimals={decimals}
            candles={activeChartCandles}
            timeframe={chartTf}
            availableTimeframes={availableTimeframes}
            onTimeframeChange={setChartTf}
            entryPrice={tierState.entryPrice}
            stopPrice={tierState.stopPrice}
            takeProfitPrice={tierState.takeProfitPrice}
            tp1Price={activeTier === 2 ? tierState.tp1Price : null}
            rrEval={rrEval}
            dailyRsi={dailyRsi}
            onPickPrice={handlePickPriceFromChart}
            onClearAllLines={handleClearAllLines}
            isLoading={isCandlesLoading || (chartTf === '1w' && isWeeklyLoading)}
          />

          {/* Signals Used Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-white text-sm">
                สัญญาณที่ใช้ยืนยัน (ระยะ {activeTier})
              </span>
              {signalsPass ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[11px] font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>ครบเกณฑ์ ({tierState.signals.length} ตัว)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[11px] font-bold">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>น้อยกว่า 2 ({tierState.signals.length}/2)</span>
                </span>
              )}
            </div>

            {!signalsPass && (
              <div className="bg-rose-950/50 border border-rose-700/60 rounded-lg p-2.5 flex items-center gap-2 text-rose-300 text-[11px] font-semibold">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>เตือน: ต้องมีสัญญาณยืนยันอย่างน้อย 2 ตัว (Indicator / Volume / แนวรับแนวต้าน ตัวไหนก็ได้)</span>
              </div>
            )}

            {/* Quick preset chips */}
            <div className="flex flex-wrap gap-1.5">
              {PRESET_SIGNALS.map(sig => {
                const active = tierState.signals.includes(sig);
                return (
                  <button
                    key={sig}
                    type="button"
                    onClick={() => handleTogglePresetSignal(sig)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                      active
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/60'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {active ? '✓ ' : '+ '}
                    {sig}
                  </button>
                );
              })}
            </div>

            {/* Custom signal input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={signalInput}
                onChange={e => setSignalInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSignal(signalInput);
                  }
                }}
                placeholder="พิมพ์สัญญาณอื่นเพิ่มเติม เช่น Stoch RSI, VWAP, Order Block..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => handleAddSignal(signalInput)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่ม</span>
              </button>
            </div>

            {/* Selected Signals Tags */}
            {tierState.signals.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tierState.signals.map(sig => (
                  <span
                    key={sig}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-[11px]"
                  >
                    <span>{sig}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSignal(sig)}
                      className="text-slate-500 hover:text-rose-400 cursor-pointer"
                      aria-label={`ลบ ${sig}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Entry, SL, TP & Auto R/R Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-white text-sm">
                ราคาเข้า / SL / TP และคำนวณ R/R (ขั้นต่ำ 1:3)
              </span>
              {latestPrice !== null && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateTierState(prev => ({
                      ...prev,
                      entryPrice: Number(latestPrice.toFixed(decimals)),
                    }))
                  }
                  className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                >
                  ใช้ราคาล่าสุดใส่ราคาเข้า
                </button>
              )}
            </div>

            <div className={`grid grid-cols-1 ${activeTier === 2 ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-3`}>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">ราคาเข้า (Entry)</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="any"
                    value={tierState.entryPrice ?? ''}
                    placeholder="กรอกราคาเข้า"
                    onChange={e => {
                      const val = e.target.value === '' ? null : Number(e.target.value);
                      onUpdateTierState(prev => ({ ...prev, entryPrice: val }));
                    }}
                    className="w-full min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                  {tierState.entryPrice !== null && (
                    <button
                      type="button"
                      onClick={() => onUpdateTierState(prev => ({ ...prev, entryPrice: null }))}
                      className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-900/70 transition-colors cursor-pointer shrink-0"
                      title="ลบราคา Entry"
                      aria-label="ลบราคา Entry"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Hard SL</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="any"
                    value={tierState.stopPrice ?? ''}
                    placeholder="กรอกราคา SL"
                    onChange={e => {
                      const val = e.target.value === '' ? null : Number(e.target.value);
                      onUpdateTierState(prev => ({ ...prev, stopPrice: val }));
                    }}
                    className="w-full min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-white text-xs focus:outline-none focus:border-rose-500"
                  />
                  {tierState.stopPrice !== null && (
                    <button
                      type="button"
                      onClick={() => onUpdateTierState(prev => ({ ...prev, stopPrice: null }))}
                      className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-900/70 transition-colors cursor-pointer shrink-0"
                      title="ลบราคา SL"
                      aria-label="ลบราคา SL"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">เป้าหมายหลัก (TP)</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="any"
                    value={tierState.takeProfitPrice ?? ''}
                    placeholder="กรอกราคา TP"
                    onChange={e => {
                      const val = e.target.value === '' ? null : Number(e.target.value);
                      onUpdateTierState(prev => ({ ...prev, takeProfitPrice: val }));
                    }}
                    className="w-full min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                  {tierState.takeProfitPrice !== null && (
                    <button
                      type="button"
                      onClick={() => onUpdateTierState(prev => ({ ...prev, takeProfitPrice: null }))}
                      className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-900/70 transition-colors cursor-pointer shrink-0"
                      title="ลบราคา TP"
                      aria-label="ลบราคา TP"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {activeTier === 2 && (
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">TP1 (ดุลพินิจ)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="any"
                      value={tierState.tp1Price ?? ''}
                      placeholder="แบ่งปิด (ถ้ามี)"
                      onChange={e => {
                        const val = e.target.value === '' ? null : Number(e.target.value);
                        onUpdateTierState(prev => ({ ...prev, tp1Price: val }));
                      }}
                      className="w-full min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-white text-xs focus:outline-none focus:border-cyan-500"
                    />
                    {tierState.tp1Price !== null && (
                      <button
                        type="button"
                        onClick={() => onUpdateTierState(prev => ({ ...prev, tp1Price: null }))}
                        className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-900/70 transition-colors cursor-pointer shrink-0"
                        title="ลบราคา TP1"
                        aria-label="ลบราคา TP1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* R/R Computed Result Box */}
            <div
              className={`rounded-lg p-3 border space-y-1.5 ${
                rrEval.valid && rrEval.meetsMinimum3
                  ? 'bg-emerald-950/30 border-emerald-700/50'
                  : rrEval.errorMessage && (tierState.entryPrice !== null || tierState.stopPrice !== null || tierState.takeProfitPrice !== null)
                  ? 'bg-rose-950/50 border-rose-600/80'
                  : 'bg-slate-950/80 border-slate-800'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span>
                    R/R:{' '}
                    <strong
                      className={`text-sm ${
                        rrEval.valid && rrEval.meetsMinimum3
                          ? 'text-emerald-400'
                          : rrEval.valid && !rrEval.meetsMinimum3
                          ? 'text-rose-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {rrEval.rrRatio !== null ? `1 : ${rrEval.rrRatio}` : '-'}
                    </strong>
                  </span>
                  {rrEval.risk !== null && (
                    <span className="text-slate-400">Risk={rrEval.risk.toFixed(decimals)}</span>
                  )}
                  {rrEval.reward !== null && rrEval.reward > 0 && (
                    <span className="text-slate-400">Reward={rrEval.reward.toFixed(decimals)}</span>
                  )}
                </div>

                {rrEval.directionLabel && (
                  <span className="text-[11px] text-slate-400">{rrEval.directionLabel}</span>
                )}
              </div>

              {rrEval.valid && rrEval.meetsMinimum3 ? (
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>ผ่านเกณฑ์ R/R ขั้นต่ำ 1:3</span>
                </div>
              ) : rrEval.errorMessage ? (
                <div
                  className={`flex items-center gap-1.5 text-[11px] font-bold ${
                    tierState.entryPrice !== null && tierState.stopPrice !== null && tierState.takeProfitPrice !== null
                      ? 'text-rose-400'
                      : 'text-slate-400'
                  }`}
                >
                  {tierState.entryPrice !== null && tierState.stopPrice !== null && tierState.takeProfitPrice !== null && (
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  )}
                  <span>{rrEval.errorMessage}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Independent Time Stop Timer Card */}
          <div
            className={`rounded-xl p-4 shadow-lg space-y-3 border ${
              timeStop.severity === 'critical'
                ? 'bg-rose-950/40 border-rose-500/80'
                : timeStop.severity === 'warn'
                ? 'bg-amber-950/30 border-amber-500/70'
                : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2">
                <Clock
                  className={`w-4 h-4 ${
                    timeStop.severity === 'critical'
                      ? 'text-rose-400'
                      : timeStop.severity === 'warn'
                      ? 'text-amber-400'
                      : 'text-cyan-400'
                  }`}
                />
                <span className="font-bold text-white text-sm">
                  ตัวนับ Time Stop (เฉพาะระยะ {activeTier})
                </span>
              </div>

              {/* Market close time configuration (only for XAU/USD and XAG/USD) */}
              {showMarketClose && (
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-slate-400">เวลาตลาดปิด:</label>
                  <input
                    type="time"
                    value={tierState.marketCloseTime}
                    onChange={e =>
                      onUpdateTierState(prev => ({
                        ...prev,
                        marketCloseTime: e.target.value,
                      }))
                    }
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                  {timeStop.msToMarketClose !== null && (
                    <span className="text-[11px] text-slate-400 font-mono">
                      (อีก {formatDurationMs(timeStop.msToMarketClose)})
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] text-slate-400">
                  {timeStop.isRunning && tierState.enteredAt
                    ? `บันทึกเข้าเมื่อ ${new Date(tierState.enteredAt).toLocaleString('th-TH')}`
                    : 'ยังไม่ได้กดบันทึกเข้าในระยะนี้'}
                </div>
                <div className="text-2xl font-bold font-mono text-white mt-0.5">
                  {timeStop.elapsedText}
                </div>
                <div
                  className={`text-[11px] font-semibold mt-1 ${
                    timeStop.severity === 'critical'
                      ? 'text-rose-300'
                      : timeStop.severity === 'warn'
                      ? 'text-amber-300'
                      : 'text-slate-300'
                  }`}
                >
                  {timeStop.headline}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!timeStop.isRunning ? (
                  <button
                    type="button"
                    onClick={handleStartEntryTimer}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer shadow-md shadow-amber-500/20"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>บันทึกเข้า (เริ่มนับเวลา)</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleStartEntryTimer}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold cursor-pointer"
                      title="รีสตาร์ทเวลานับใหม่เป็นตอนนี้"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>เริ่มนับใหม่</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleResetEntryTimer}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-800 border border-rose-700 text-rose-200 font-bold cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>ปิดสถานะ / ล้างเวลา</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Time Stop Warnings */}
            {timeStop.warnings.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {timeStop.warnings.map((w, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-lg border flex items-center gap-2 text-xs font-bold ${
                      timeStop.severity === 'critical'
                        ? 'bg-rose-950/80 border-rose-500 text-rose-200'
                        : 'bg-amber-950/60 border-amber-500/70 text-amber-200'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Tier Checklist + Upgrade Gate */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
            <div className="border-b border-slate-800 pb-2">
              <h3 className="font-bold text-white text-sm">
                Checklist เงื่อนไขระยะ {activeTier}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                แสดงสถานะผ่าน/ไม่ผ่านแต่ละข้อเพื่อคุมวินัย — ไม่มีคะแนนรวมและไม่มีคำแนะนำ Buy/Sell
              </p>
            </div>

            {/* Automatic rule rows (Signals >= 2 & R/R >= 1:3) */}
            <div className="space-y-2">
              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-200">สัญญาณยืนยัน ≥ 2 ตัว (ตรวจอัตโนมัติ)</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    ปัจจุบันระบุไว้ {tierState.signals.length} ตัว
                  </div>
                </div>
                {signalsPass ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[11px] font-bold shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>ผ่าน</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[11px] font-bold shrink-0">
                    <XCircle className="w-3.5 h-3.5" />
                    <span>ไม่ผ่าน</span>
                  </span>
                )}
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-200">Hard SL และ R/R ขั้นต่ำ 1:3 (ตรวจอัตโนมัติ)</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {rrEval.rrRatio !== null ? `R/R ที่คำนวณได้ = 1 : ${rrEval.rrRatio}` : rrEval.errorMessage}
                  </div>
                </div>
                {rrPass ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[11px] font-bold shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>ผ่าน</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[11px] font-bold shrink-0">
                    <XCircle className="w-3.5 h-3.5" />
                    <span>ไม่ผ่าน</span>
                  </span>
                )}
              </div>

              {/* Manual checklist items for this tier */}
              {visibleChecklist.map(item => {
                const checked = Boolean(tierState.checklist[item.id]);
                return (
                  <label
                    key={item.id}
                    className={`block bg-slate-950/80 border rounded-lg p-3 cursor-pointer transition-colors ${
                      checked ? 'border-emerald-700/60' : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleChecklist(item.id)}
                          className="mt-0.5 rounded accent-emerald-500 w-4 h-4 cursor-pointer shrink-0"
                        />
                        <div>
                          <div className="font-bold text-slate-200">{item.label}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                            {item.detail}
                          </div>
                        </div>
                      </div>
                      {checked ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[11px] font-bold shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>ผ่าน</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[11px] font-bold shrink-0">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>ยังไม่ผ่าน</span>
                        </span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Upgrade Tier Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-white text-sm flex items-center gap-1.5">
                <ArrowUpCircle className="w-4 h-4 text-amber-400" />
                <span>อัปเกรดระยะ / เพิ่มไม้</span>
              </span>
              <span className="text-[11px] text-slate-400">
                {activeTier === 1 ? 'ระยะ 1 → ระยะ 2' : activeTier === 2 ? 'ระยะ 2 → ระยะ 3' : 'ระยะสูงสุด'}
              </span>
            </div>

            {canUpgrade ? (
              <div className="space-y-3">
                <label className="flex items-start gap-2.5 bg-slate-950/80 border border-slate-800 rounded-lg p-3 cursor-pointer hover:border-slate-700">
                  <input
                    type="checkbox"
                    checked={tierState.htfConfirmed}
                    onChange={e =>
                      onUpdateTierState(prev => ({
                        ...prev,
                        htfConfirmed: e.target.checked,
                      }))
                    }
                    className="mt-0.5 rounded accent-amber-500 w-4 h-4 cursor-pointer shrink-0"
                  />
                  <div>
                    <div className="font-bold text-slate-200">{upgradeGateLabel}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      กฎวินัย: อัปเกรดระยะ/เพิ่มไม้ ได้เมื่อ TF ใหญ่กว่ายืนยันเท่านั้น (ระยะ 2 = Daily, ระยะ 3 = Weekly)
                    </div>
                  </div>
                </label>

                <button
                  type="button"
                  disabled={!tierState.htfConfirmed}
                  onClick={() => onUpgradeTier(activeTier, nextTier)}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                    tierState.htfConfirmed
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 cursor-pointer'
                      : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  }`}
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  <span>
                    {tierState.htfConfirmed
                      ? `อัปเกรดระยะ → ระยะ ${nextTier}`
                      : `อัปเกรดระยะ (กรุณาติ๊ก TF ใหญ่ยืนยันก่อน)`}
                  </span>
                </button>
              </div>
            ) : (
              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-[11px] text-slate-400">
                อยู่ในระยะ 3 (ยาว) ซึ่งเป็นระยะสูงสุดแล้ว — ถือตามโครงสร้าง Weekly/Daily ตาม Dow Theory
              </div>
            )}
          </div>

          {/* Note & Disclaimer */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
            <label className="block text-[11px] font-semibold text-slate-400">
              บันทึกดุลพินิจ (เช่น ขนาดไม้ / เหตุผล / ข่าวที่เช็ค)
            </label>
            <textarea
              rows={2}
              value={tierState.note}
              onChange={e => onUpdateTierState(prev => ({ ...prev, note: e.target.value }))}
              placeholder="บันทึกขนาดไม้และแผนของคุณเอง..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 text-center text-slate-400 text-xs">
            <span>เครื่องมือตรวจวินัยและเวลาตามกฎ — ผู้ใช้ตัดสินใจเอง</span>
          </div>
        </div>
      </div>
    </div>
  );
};
