import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  SCALP_ASSETS,
  BreakoutScalpAssetConfig,
  loadScalpConfigs,
  saveScalpConfigs,
  ScalpSide,
  evaluateBreakoutScalp,
  filterClosedCandles,
  aggregate1hTo4h,
} from '../services/breakoutScalp';
import { Candle, Timeframe } from '../types/trading';
import { fetchBinanceKlines } from '../services/marketData';
import {
  SlidersHorizontal,
  Bell,
  BellOff,
  Clock,
  TrendingUp,
  Activity,
  Layers,
  Info,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  FileCheck2,
} from 'lucide-react';

interface BreakoutScalpViewProps {
  onTriggerAlert?: (msg: string) => void;
}

export const BreakoutScalpView: React.FC<BreakoutScalpViewProps> = () => {
  const [configs, setConfigs] = useState<Record<string, BreakoutScalpAssetConfig>>(() => loadScalpConfigs());
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC/USDT');
  const [activeTab, setActiveTab] = useState<ScalpSide>('bull');

  // Multi-timeframe Candle states for the current asset
  const [ltfCandles, setLtfCandles] = useState<Candle[]>([]);
  const [h1Candles, setH1Candles] = useState<Candle[]>([]);
  const [h4Candles, setH4Candles] = useState<Candle[]>([]);
  const [d1Candles, setD1Candles] = useState<Candle[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(Date.now());

  const currentConfig = configs[selectedSymbol] || configs['BTC/USDT'];

  // Save config helper
  const updateConfig = useCallback((updater: (prev: BreakoutScalpAssetConfig) => BreakoutScalpAssetConfig) => {
    setConfigs(prev => {
      const next = {
        ...prev,
        [selectedSymbol]: updater(prev[selectedSymbol]),
      };
      saveScalpConfigs(next);
      return next;
    });
  }, [selectedSymbol]);

  // Fetch candles for an asset
  const fetchCandlesForAsset = useCallback(async (symbol: string, tf: '1m' | '5m') => {
    const assetMeta = SCALP_ASSETS.find(a => a.symbol === symbol);
    if (!assetMeta) return;

    try {
      if (assetMeta.source === 'Binance') {
        // Binance: fetch LTF, 1h, 4h, 1d in parallel
        const [ltf, h1, h4, d1] = await Promise.all([
          fetchBinanceKlines(symbol, tf as Timeframe),
          fetchBinanceKlines(symbol, '1h'),
          fetchBinanceKlines(symbol, '4h'),
          fetchBinanceKlines(symbol, '1d'),
        ]);
        setLtfCandles(ltf);
        setH1Candles(h1);
        setH4Candles(h4);
        setD1Candles(d1);
      } else {
        // Yahoo Finance via server proxy /api/klines
        // Fetch LTF, 1h, 1d
        const [ltfRes, h1Res, d1Res] = await Promise.all([
          fetch(`/api/klines?symbol=${encodeURIComponent(symbol)}&timeframe=${tf}`),
          fetch(`/api/klines?symbol=${encodeURIComponent(symbol)}&timeframe=1h`),
          fetch(`/api/klines?symbol=${encodeURIComponent(symbol)}&timeframe=1d`),
        ]);

        const [ltfData, h1Data, d1Data] = await Promise.all([
          ltfRes.json(),
          h1Res.json(),
          d1Res.json(),
        ]);

        const ltf = ltfData.candles || [];
        const h1 = h1Data.candles || [];
        const d1 = d1Data.candles || [];
        // Yahoo has no native 4h -> aggregate 1h to 4h
        const h4 = aggregate1hTo4h(h1);

        setLtfCandles(ltf);
        setH1Candles(h1);
        setH4Candles(h4);
        setD1Candles(d1);
      }
      setLastRefreshedAt(Date.now());
    } catch (err) {
      console.error('Error fetching candles for Breakout Scalp:', err);
    }
  }, []);

  // Initial fetch on asset or TF change
  useEffect(() => {
    setIsLoading(true);
    fetchCandlesForAsset(selectedSymbol, currentConfig.timeframe).finally(() => {
      setIsLoading(false);
    });
  }, [selectedSymbol, currentConfig.timeframe, fetchCandlesForAsset]);

  // Polling timers:
  // LTF: Binance 10s, Yahoo 30s
  // HTF: 5 minutes (300s)
  useEffect(() => {
    const isBinance = currentConfig.source === 'Binance';
    const ltfIntervalMs = isBinance ? 10000 : 30000;

    const ltfTimer = setInterval(() => {
      // Refresh LTF
      const fetchLTFOnly = async () => {
        try {
          if (isBinance) {
            const ltf = await fetchBinanceKlines(selectedSymbol, currentConfig.timeframe as Timeframe);
            setLtfCandles(ltf);
          } else {
            const res = await fetch(`/api/klines?symbol=${encodeURIComponent(selectedSymbol)}&timeframe=${currentConfig.timeframe}`);
            const data = await res.json();
            if (data.candles) setLtfCandles(data.candles);
          }
          setLastRefreshedAt(Date.now());
        } catch {}
      };
      fetchLTFOnly();
    }, ltfIntervalMs);

    const htfTimer = setInterval(() => {
      // Refresh HTF every 5 minutes
      fetchCandlesForAsset(selectedSymbol, currentConfig.timeframe);
    }, 300000);

    return () => {
      clearInterval(ltfTimer);
      clearInterval(htfTimer);
    };
  }, [selectedSymbol, currentConfig.source, currentConfig.timeframe, fetchCandlesForAsset]);

  // Closed candles calculation
  const tfSec = currentConfig.timeframe === '1m' ? 60 : 300;
  const closedLTF = useMemo(() => filterClosedCandles(ltfCandles, tfSec), [ltfCandles, tfSec]);
  const lastClosedCandle = closedLTF.length > 0 ? closedLTF[closedLTF.length - 1] : null;

  // Run Checklist Evaluation 0–8
  const checklistResult = useMemo(() => {
    return evaluateBreakoutScalp(
      currentConfig,
      activeTab,
      ltfCandles,
      h1Candles,
      h4Candles,
      d1Candles
    );
  }, [currentConfig, activeTab, ltfCandles, h1Candles, h4Candles, d1Candles]);

  // Quick helper to set current closed price as level
  const setLevelToCurrent = (side: 'high' | 'low') => {
    if (!lastClosedCandle) return;
    const now = Date.now();
    updateConfig(prev => ({
      ...prev,
      [side === 'high' ? 'levelHigh' : 'levelLow']: lastClosedCandle.close,
      [side === 'high' ? 'levelHighSetAt' : 'levelLowSetAt']: now,
    }));
  };

  // Status icon mapper for checklist
  const renderStatusBadge = (status: 'pass' | 'fail' | 'warn' | 'unknown' | 'info') => {
    switch (status) {
      case 'pass':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[11px] font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>ผ่านเกณฑ์</span>
          </span>
        );
      case 'fail':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[11px] font-bold">
            <XCircle className="w-3.5 h-3.5" />
            <span>ไม่ผ่าน</span>
          </span>
        );
      case 'warn':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>พึงระวัง</span>
          </span>
        );
      case 'unknown':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[11px] font-bold">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>ยังไม่ชัดเจน</span>
          </span>
        );
      case 'info':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[11px] font-bold">
            <Info className="w-3.5 h-3.5" />
            <span>ข้อมูล</span>
          </span>
        );
    }
  };

  // SVG Chart rendering for last 90 closed candles
  const chartCandles = useMemo(() => {
    return closedLTF.slice(-90);
  }, [closedLTF]);

  const svgDimensions = { width: 900, height: 380, volumeHeight: 75, paddingRight: 65, paddingLeft: 10, paddingTop: 20, paddingBottom: 25 };

  const chartCalculations = useMemo(() => {
    if (chartCandles.length === 0) return null;
    const { width, height, volumeHeight, paddingRight, paddingLeft, paddingTop, paddingBottom } = svgDimensions;
    const chartW = width - paddingLeft - paddingRight;
    const priceAreaH = height - volumeHeight - paddingTop - paddingBottom;

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVol = 0;

    chartCandles.forEach(c => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume > maxVol) maxVol = c.volume;
    });

    // Expand price scale to include configured levels if present
    if (currentConfig.levelHigh !== null) {
      if (currentConfig.levelHigh > maxPrice) maxPrice = currentConfig.levelHigh;
      if (currentConfig.levelHigh < minPrice) minPrice = currentConfig.levelHigh;
    }
    if (currentConfig.levelLow !== null) {
      if (currentConfig.levelLow > maxPrice) maxPrice = currentConfig.levelLow;
      if (currentConfig.levelLow < minPrice) minPrice = currentConfig.levelLow;
    }

    const priceRange = maxPrice - minPrice || 1;
    const paddedMin = minPrice - priceRange * 0.05;
    const paddedMax = maxPrice + priceRange * 0.05;
    const paddedRange = paddedMax - paddedMin || 1;

    const barW = Math.max(3, chartW / chartCandles.length);
    const candleBodyW = Math.max(2, barW * 0.72);

    const priceToY = (p: number) => paddingTop + priceAreaH - ((p - paddedMin) / paddedRange) * priceAreaH;
    const volToH = (v: number) => (maxVol > 0 ? (v / maxVol) * volumeHeight : 0);

    // Compute 20-period average volume for the 2x avg line
    let volSum = 0;
    const avg20Arr: (number | null)[] = [];
    chartCandles.forEach((c, i) => {
      volSum += c.volume || 0;
      if (i >= 20) volSum -= chartCandles[i - 20].volume || 0;
      if (i >= 19) avg20Arr.push(volSum / 20);
      else avg20Arr.push(null);
    });

    return {
      priceToY,
      volToH,
      chartW,
      priceAreaH,
      paddedMin,
      paddedMax,
      barW,
      candleBodyW,
      avg20Arr,
      maxVol,
    };
  }, [chartCandles, currentConfig.levelHigh, currentConfig.levelLow]);

  const lastClosedTimeStr = lastClosedCandle
    ? new Date(lastClosedCandle.time * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '-';

  return (
    <div className="flex flex-col gap-4 w-full pb-16 select-none font-sans text-slate-100">
      {/* Asset Switcher Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-900 border border-slate-800 p-2 rounded-xl">
        {SCALP_ASSETS.map((asset) => {
          const isSelected = asset.symbol === selectedSymbol;
          const conf = configs[asset.symbol];
          return (
            <button
              key={asset.symbol}
              onClick={() => setSelectedSymbol(asset.symbol)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isSelected
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
              }`}
            >
              <span>{asset.symbol}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isSelected ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                {conf?.timeframe.toUpperCase() || '5M'}
              </span>
              {conf?.alertEnabled && (
                <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-slate-950' : 'bg-amber-400'}`} />
              )}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2 text-xs text-slate-400 font-mono">
          <button
            onClick={() => {
              setIsLoading(true);
              fetchCandlesForAsset(selectedSymbol, currentConfig.timeframe).finally(() => setIsLoading(false));
            }}
            disabled={isLoading}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 cursor-pointer"
            title="รีเฟรชข้อมูลแท่งเทียน"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left Chart + Config, Right Checklist 0-8 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column (7 cols): Chart & Asset Parameters */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Chart Header Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-2 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2.5">
                <span className="text-base font-bold text-white">{selectedSymbol}</span>
                <span className="text-xs text-slate-400">({currentConfig.thaiName})</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-400 font-mono text-[11px] font-bold">
                  TF {currentConfig.timeframe.toUpperCase()}
                </span>
                {currentConfig.source === 'Yahoo' && (
                  <span className="text-[10px] text-cyan-400 font-mono bg-cyan-950/60 border border-cyan-800 px-1.5 py-0.2 rounded">
                    COMEX Futures
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Data as of {lastClosedTimeStr}</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-300">{currentConfig.source}</span>
              </div>
            </div>

            {/* SVG Candlestick Chart (90 closed candles) */}
            <div className="w-full h-[380px] bg-slate-950 rounded-lg border border-slate-800/80 relative overflow-hidden flex items-center justify-center">
              {chartCalculations && chartCandles.length > 0 ? (
                <svg
                  viewBox={`0 0 ${svgDimensions.width} ${svgDimensions.height}`}
                  className="w-full h-full"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="bullVolGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.2" />
                    </linearGradient>
                    <linearGradient id="bearVolGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity="0.2" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid & Price Ticks */}
                  {[0, 0.25, 0.5, 0.75, 1.0].map((frac, idx) => {
                    const price = chartCalculations.paddedMin + frac * (chartCalculations.paddedMax - chartCalculations.paddedMin);
                    const y = chartCalculations.priceToY(price);
                    return (
                      <g key={idx}>
                        <line
                          x1={svgDimensions.paddingLeft}
                          y1={y}
                          x2={svgDimensions.width - svgDimensions.paddingRight}
                          y2={y}
                          stroke="#1e293b"
                          strokeDasharray="2 3"
                        />
                        <text
                          x={svgDimensions.width - svgDimensions.paddingRight + 5}
                          y={y + 3}
                          fill="#64748b"
                          fontSize="9"
                          fontFamily="monospace"
                        >
                          {price.toFixed(currentConfig.decimals)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Volume Separator Line */}
                  <line
                    x1={svgDimensions.paddingLeft}
                    y1={svgDimensions.height - svgDimensions.volumeHeight - svgDimensions.paddingBottom}
                    x2={svgDimensions.width - svgDimensions.paddingRight}
                    y2={svgDimensions.height - svgDimensions.volumeHeight - svgDimensions.paddingBottom}
                    stroke="#334155"
                  />

                  {/* Volume 2x Avg Line & Label */}
                  {(() => {
                    const volBaseY = svgDimensions.height - svgDimensions.paddingBottom;
                    const pathD = chartCandles
                      .map((_, i) => {
                        const avg = chartCalculations.avg20Arr[i];
                        if (avg === null) return null;
                        const x = svgDimensions.paddingLeft + i * chartCalculations.barW + chartCalculations.barW / 2;
                        const y = volBaseY - chartCalculations.volToH(avg * 2);
                        return `${i === 20 ? 'M' : 'L'} ${x} ${y}`;
                      })
                      .filter(Boolean)
                      .join(' ');

                    return pathD ? (
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="1.2"
                        strokeDasharray="3 2"
                      />
                    ) : null;
                  })()}

                  {/* Configured Upper Line (Level High) */}
                  {currentConfig.levelHigh !== null && (
                    <g>
                      <line
                        x1={svgDimensions.paddingLeft}
                        y1={chartCalculations.priceToY(currentConfig.levelHigh)}
                        x2={svgDimensions.width - svgDimensions.paddingRight}
                        y2={chartCalculations.priceToY(currentConfig.levelHigh)}
                        stroke="#10b981"
                        strokeWidth="1.8"
                        strokeDasharray="5 3"
                      />
                      <rect
                        x={svgDimensions.width - svgDimensions.paddingRight + 2}
                        y={chartCalculations.priceToY(currentConfig.levelHigh) - 8}
                        width="58"
                        height="16"
                        fill="#064e3b"
                        rx="2"
                      />
                      <text
                        x={svgDimensions.width - svgDimensions.paddingRight + 6}
                        y={chartCalculations.priceToY(currentConfig.levelHigh) + 3}
                        fill="#34d399"
                        fontSize="9"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {currentConfig.levelHigh.toFixed(currentConfig.decimals)}
                      </text>
                    </g>
                  )}

                  {/* Configured Lower Line (Level Low) */}
                  {currentConfig.levelLow !== null && (
                    <g>
                      <line
                        x1={svgDimensions.paddingLeft}
                        y1={chartCalculations.priceToY(currentConfig.levelLow)}
                        x2={svgDimensions.width - svgDimensions.paddingRight}
                        y2={chartCalculations.priceToY(currentConfig.levelLow)}
                        stroke="#f43f5e"
                        strokeWidth="1.8"
                        strokeDasharray="5 3"
                      />
                      <rect
                        x={svgDimensions.width - svgDimensions.paddingRight + 2}
                        y={chartCalculations.priceToY(currentConfig.levelLow) - 8}
                        width="58"
                        height="16"
                        fill="#881337"
                        rx="2"
                      />
                      <text
                        x={svgDimensions.width - svgDimensions.paddingRight + 6}
                        y={chartCalculations.priceToY(currentConfig.levelLow) + 3}
                        fill="#fb7185"
                        fontSize="9"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {currentConfig.levelLow.toFixed(currentConfig.decimals)}
                      </text>
                    </g>
                  )}

                  {/* Candlesticks & Volume Bars */}
                  {chartCandles.map((c, i) => {
                    const isUp = c.close >= c.open;
                    const xCenter = svgDimensions.paddingLeft + i * chartCalculations.barW + chartCalculations.barW / 2;
                    const xLeft = xCenter - chartCalculations.candleBodyW / 2;
                    const yOpen = chartCalculations.priceToY(c.open);
                    const yClose = chartCalculations.priceToY(c.close);
                    const yHigh = chartCalculations.priceToY(c.high);
                    const yLow = chartCalculations.priceToY(c.low);

                    const bodyTop = Math.min(yOpen, yClose);
                    const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));

                    // Volume
                    const vH = chartCalculations.volToH(c.volume || 0);
                    const vY = svgDimensions.height - svgDimensions.paddingBottom - vH;

                    // Trigger detection marker
                    const isTrigger = checklistResult.trigger?.triggerCandle.time === c.time;

                    return (
                      <g key={c.time}>
                        {/* Volume bar */}
                        <rect
                          x={xLeft}
                          y={vY}
                          width={chartCalculations.candleBodyW}
                          height={vH}
                          fill={isUp ? 'url(#bullVolGrad)' : 'url(#bearVolGrad)'}
                        />

                        {/* Wick */}
                        <line
                          x1={xCenter}
                          y1={yHigh}
                          x2={xCenter}
                          y2={yLow}
                          stroke={isUp ? '#10b981' : '#f43f5e'}
                          strokeWidth="1.2"
                        />

                        {/* Candle Body */}
                        <rect
                          x={xLeft}
                          y={bodyTop}
                          width={chartCalculations.candleBodyW}
                          height={bodyH}
                          fill={isUp ? '#10b981' : '#f43f5e'}
                        />

                        {/* Arrow Marker for Trigger Candle */}
                        {isTrigger && (
                          <g>
                            <circle
                              cx={xCenter}
                              cy={activeTab === 'bull' ? yHigh - 14 : yLow + 14}
                              r="7"
                              fill={activeTab === 'bull' ? '#10b981' : '#f43f5e'}
                            />
                            <text
                              x={xCenter}
                              y={activeTab === 'bull' ? yHigh - 10 : yLow + 18}
                              fill="#020617"
                              fontSize="9"
                              fontWeight="black"
                              textAnchor="middle"
                            >
                              {activeTab === 'bull' ? '▲' : '▼'}
                            </text>
                            <text
                              x={xCenter}
                              y={activeTab === 'bull' ? yHigh - 22 : yLow + 28}
                              fill="#38bdf8"
                              fontSize="8"
                              fontFamily="monospace"
                              fontWeight="bold"
                              textAnchor="middle"
                            >
                              TRIGGER
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </svg>
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-500 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mb-1 text-amber-400" />
                  <span>กำลังโหลดข้อมูลแท่งเทียน...</span>
                </div>
              )}
            </div>

            {/* Sub chart footer disclaimer & source notes */}
            <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 font-mono px-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                <span>เส้นประสีส้ม = 2× วอลุ่มเฉลี่ย 20 บาร์</span>
              </span>
              {currentConfig.source === 'Yahoo' && (
                <span className="text-amber-300/80">
                  *Volume เป็นข้อมูลสัญญา Futures COMEX
                </span>
              )}
            </div>
          </div>

          {/* Asset Configuration Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-white flex items-center gap-1.5 text-sm">
                <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                <span>การตั้งค่าสินทรัพย์ ({selectedSymbol})</span>
              </span>

              {/* Alert Toggle */}
              <button
                onClick={() => updateConfig(c => ({ ...c, alertEnabled: !c.alertEnabled }))}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border font-bold transition-all cursor-pointer ${
                  currentConfig.alertEnabled
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                {currentConfig.alertEnabled ? <Bell className="w-3.5 h-3.5 text-amber-400" /> : <BellOff className="w-3.5 h-3.5 text-slate-500" />}
                <span>{currentConfig.alertEnabled ? 'Alert: เปิด' : 'Alert: ปิด'}</span>
              </button>
            </div>

            {/* Timeframe & Setup Selection */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Timeframe (LTF)</label>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  {(['1m', '5m'] as const).map(tf => (
                    <button
                      key={tf}
                      onClick={() => updateConfig(c => ({ ...c, timeframe: tf }))}
                      className={`py-1 text-center font-mono font-bold rounded cursor-pointer ${
                        currentConfig.timeframe === tf ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {tf.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">ทิศทาง Fundamental</label>
                <select
                  value={currentConfig.fundDirection}
                  onChange={e => updateConfig(c => ({ ...c, fundDirection: e.target.value as any }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="up">▲ ขึ้น (Bullish)</option>
                  <option value="down">▼ ลง (Bearish)</option>
                  <option value="unclear">❓ ไม่ชัดเจน</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Setup Type</label>
                <select
                  value={currentConfig.setup}
                  onChange={e => updateConfig(c => ({ ...c, setup: e.target.value as any }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="Trend">Trend (ตามแนวโน้มเดิม)</option>
                  <option value="Impulse">Impulse (สปีดแรง สวน HTF)</option>
                  <option value="Rebound">Rebound (เด้งฟื้นตัว)</option>
                </select>
              </div>
            </div>

            {/* Upper and Lower Price Lines */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-slate-800/80">
              {/* Upper Line */}
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <span>เส้นบน (Upper Level)</span>
                  </span>
                  <button
                    onClick={() => setLevelToCurrent('high')}
                    className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                  >
                    ใช้ราคาปิดล่าสุด
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="any"
                    value={currentConfig.levelHigh ?? ''}
                    placeholder="เช่น 96500.00"
                    onChange={e => {
                      const val = e.target.value === '' ? null : Number(e.target.value);
                      updateConfig(c => ({ ...c, levelHigh: val, levelHighSetAt: val !== null ? Date.now() : null }));
                    }}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
                {currentConfig.levelHighSetAt && (
                  <span className="text-[10px] text-slate-500 font-mono mt-1 block">
                    บันทึกเวลา: {new Date(currentConfig.levelHighSetAt).toLocaleTimeString('th-TH')}
                  </span>
                )}
              </div>

              {/* Lower Line */}
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-rose-400 font-bold flex items-center gap-1">
                    <span>เส้นล่าง (Lower Level)</span>
                  </span>
                  <button
                    onClick={() => setLevelToCurrent('low')}
                    className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                  >
                    ใช้ราคาปิดล่าสุด
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="any"
                    value={currentConfig.levelLow ?? ''}
                    placeholder="เช่น 94200.00"
                    onChange={e => {
                      const val = e.target.value === '' ? null : Number(e.target.value);
                      updateConfig(c => ({ ...c, levelLow: val, levelLowSetAt: val !== null ? Date.now() : null }));
                    }}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-white text-xs focus:outline-none focus:border-rose-500"
                  />
                </div>
                {currentConfig.levelLowSetAt && (
                  <span className="text-[10px] text-slate-500 font-mono mt-1 block">
                    บันทึกเวลา: {new Date(currentConfig.levelLowSetAt).toLocaleTimeString('th-TH')}
                  </span>
                )}
              </div>
            </div>

            {/* Real Targets, Buffer, Entry & Stop Modes */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1 border-t border-slate-800/80">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">เป้าจริงฝั่งขึ้น (Bull Target)</label>
                <input
                  type="number"
                  step="any"
                  value={currentConfig.targetBull ?? ''}
                  placeholder="เช่น 98000"
                  onChange={e => {
                    const val = e.target.value === '' ? null : Number(e.target.value);
                    updateConfig(c => ({ ...c, targetBull: val }));
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 font-mono text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">เป้าจริงฝั่งลง (Bear Target)</label>
                <input
                  type="number"
                  step="any"
                  value={currentConfig.targetBear ?? ''}
                  placeholder="เช่น 92500"
                  onChange={e => {
                    const val = e.target.value === '' ? null : Number(e.target.value);
                    updateConfig(c => ({ ...c, targetBear: val }));
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 font-mono text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Buffer Spread+Slippage</label>
                <input
                  type="number"
                  step="any"
                  value={currentConfig.buffer}
                  onChange={e => {
                    const val = Math.max(0, Number(e.target.value) || 0);
                    updateConfig(c => ({ ...c, buffer: val }));
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 font-mono text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">โหมดจุดเข้า (Entry)</label>
                <select
                  value={currentConfig.entryMode}
                  onChange={e => updateConfig(c => ({ ...c, entryMode: e.target.value as any }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="immediate">ทะลุทันที (Close ± buffer)</option>
                  <option value="retest">Retest (เส้น ± buffer)</option>
                </select>
              </div>
            </div>

            {/* Stop Mode & Event Checkboxes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 border-t border-slate-800/80">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">โหมด Stop Loss</label>
                <select
                  value={currentConfig.stopMode}
                  onChange={e => updateConfig(c => ({ ...c, stopMode: e.target.value as any }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="beyond_line">ข้ามเส้น (ใต้/เหนือเส้น ± buffer)</option>
                  <option value="candle_extreme">สุดแท่ง Breakout (Low/High ± buffer)</option>
                </select>
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                  <input
                    type="checkbox"
                    checked={currentConfig.hasClearNarrative}
                    onChange={e => updateConfig(c => ({ ...c, hasClearNarrative: e.target.checked }))}
                    className="rounded accent-amber-500 cursor-pointer w-4 h-4"
                  />
                  <span>มี Narrative ตลาดชัดเจน</span>
                </label>
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                  <input
                    type="checkbox"
                    checked={currentConfig.isEventFirstCandle}
                    onChange={e => updateConfig(c => ({ ...c, isEventFirstCandle: e.target.checked }))}
                    className="rounded accent-amber-500 cursor-pointer w-4 h-4"
                  />
                  <span>แท่งแรก CPI / NFP / Fed</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Checklist 0–8 */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          {/* Tabs for Bull Breakout vs Bear Breakdown */}
          <div className="grid grid-cols-2 gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-xl shadow">
            <button
              onClick={() => setActiveTab('bull')}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'bull'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-emerald-400'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>▲ ทะลุขึ้น (Bull Breakout)</span>
            </button>
            <button
              onClick={() => setActiveTab('bear')}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'bear'
                  ? 'bg-rose-500 text-slate-950 shadow-md shadow-rose-500/20'
                  : 'text-slate-400 hover:text-rose-400'
              }`}
            >
              <ArrowDownRight className="w-4 h-4" />
              <span>▼ หลุดลง (Bear Breakdown)</span>
            </button>
          </div>

          {/* Quick Summary Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-md flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-400 text-[11px] block">เส้นที่ตรวจจับ:</span>
              <span className="text-base font-bold font-mono text-white">
                {checklistResult.level !== null ? checklistResult.level.toFixed(currentConfig.decimals) : 'ยังไม่ระบุ'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 text-[11px] block">สถานะ Trigger:</span>
              <span className={`text-xs font-bold font-mono ${checklistResult.trigger ? 'text-emerald-400' : 'text-slate-400'}`}>
                {checklistResult.trigger ? `พบ (ย้อนหลัง ${checklistResult.trigger.barsAgo} บาร์)` : 'ยังไม่พบ'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 text-[11px] block">R:R เป้าจริง:</span>
              <span className={`text-sm font-bold font-mono ${checklistResult.actualRR && checklistResult.actualRR >= 3 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {checklistResult.actualRR !== null ? `1 : ${checklistResult.actualRR}` : '-'}
              </span>
            </div>
          </div>

          {/* Checklist 0–8 Accordion / List */}
          <div className="space-y-2.5">
            {checklistResult.items.map((item) => (
              <div
                key={item.step}
                className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm space-y-1.5 hover:border-slate-700 transition-colors"
              >
                {/* Header: Step & Inference status badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 font-mono text-[10px] font-bold flex items-center justify-center border border-slate-700">
                      {item.step}
                    </span>
                    <span className="text-xs font-bold text-white">{item.title}</span>
                  </div>
                  {renderStatusBadge(item.status)}
                </div>

                {/* [FACT] Row */}
                <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80 text-[11px] text-slate-300 font-mono leading-relaxed">
                  <span className="text-cyan-400 font-bold mr-1.5">[FACT]</span>
                  <span>{item.fact}</span>
                </div>

                {/* [INFERENCE] Row */}
                <div className="text-[11px] text-slate-300 font-sans pl-1 flex items-start gap-1.5">
                  <span className="text-amber-400 font-bold shrink-0">[INFERENCE]</span>
                  <span className="leading-relaxed">{item.inference}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Mandatory Disclaimer Footer */}
          <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 text-center text-slate-400 text-xs">
            <span>เครื่องมือตรวจเงื่อนไข ไม่ใช่คำแนะนำทางการเงิน</span>
          </div>
        </div>
      </div>
    </div>
  );
};
