import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  CrosshairMode,
  ColorType,
  LineStyle,
  IChartApi,
  ISeriesApi,
  IPriceLine,
  UTCTimestamp,
  CandlestickData,
  HistogramData,
  MouseEventParams,
  Time,
} from 'lightweight-charts';
import { Candle } from '../types/trading';
import { Crosshair, RefreshCw, X } from 'lucide-react';

export type TierChartTimeframe = '1w' | '1d' | '4h' | '1h';
export type PricePickMode = 'entry' | 'sl' | 'tp' | null;

interface EntryTierChartProps {
  symbol: string;
  decimals: number;
  candles: Candle[];
  timeframe: TierChartTimeframe;
  availableTimeframes: TierChartTimeframe[];
  onTimeframeChange: (tf: TierChartTimeframe) => void;
  entryPrice: number | null;
  stopPrice: number | null;
  takeProfitPrice: number | null;
  onPickPrice: (mode: Exclude<PricePickMode, null>, price: number) => void;
  isLoading?: boolean;
}

interface LegendEntry {
  timeStr: string;
  open: number;
  high: number;
  low: number;
  close: number;
  changePct: number;
}

const TF_LABELS: Record<TierChartTimeframe, string> = {
  '1w': 'Weekly',
  '1d': 'Daily',
  '4h': 'H4',
  '1h': 'H1',
};

export const EntryTierChart: React.FC<EntryTierChartProps> = ({
  symbol,
  decimals,
  candles,
  timeframe,
  availableTimeframes,
  onTimeframeChange,
  entryPrice,
  stopPrice,
  takeProfitPrice,
  onPickPrice,
  isLoading = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const entryLineRef = useRef<IPriceLine | null>(null);
  const slLineRef = useRef<IPriceLine | null>(null);
  const tpLineRef = useRef<IPriceLine | null>(null);

  const [pickMode, setPickMode] = useState<PricePickMode>(null);
  const [hoveredData, setHoveredData] = useState<LegendEntry | null>(null);

  const pickModeRef = useRef<PricePickMode>(null);
  pickModeRef.current = pickMode;

  const onPickPriceRef = useRef(onPickPrice);
  onPickPriceRef.current = onPickPrice;

  const decimalsRef = useRef(decimals);
  decimalsRef.current = decimals;

  // Esc key exits pick mode
  useEffect(() => {
    if (pickMode === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPickMode(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pickMode]);

  // Deduplicate and chronologically sort candles
  const processedData = useMemo(() => {
    if (!candles || candles.length === 0) {
      return { items: [] as Candle[], map: new Map<number, LegendEntry>() };
    }

    const sorted = [...candles].sort((a, b) => a.time - b.time);
    const unique: Candle[] = [];
    for (const c of sorted) {
      const tSec = c.time > 1e11 ? Math.floor(c.time / 1000) : Math.floor(c.time);
      const normalized = { ...c, time: tSec };
      if (unique.length > 0 && unique[unique.length - 1].time === tSec) {
        unique[unique.length - 1] = normalized;
      } else {
        unique.push(normalized);
      }
    }

    const map = new Map<number, LegendEntry>();
    const formatTimeStr = (tSec: number): string => {
      const d = new Date(tSec * 1000);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      if (timeframe === '1d' || timeframe === '1w') {
        return `${y}-${m}-${day}`;
      }
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${day} ${hh}:${mm}`;
    };

    unique.forEach((c, i) => {
      const prevClose = i > 0 ? unique[i - 1].close : c.open;
      const changePct = prevClose ? ((c.close - prevClose) / prevClose) * 100 : 0;
      map.set(c.time, {
        timeStr: formatTimeStr(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        changePct,
      });
    });

    return { items: unique, map };
  }, [candles, timeframe]);

  const legendMapRef = useRef<Map<number, LegendEntry>>(processedData.map);
  legendMapRef.current = processedData.map;

  const latestEntry = useMemo<LegendEntry | null>(() => {
    if (processedData.items.length === 0) return null;
    const last = processedData.items[processedData.items.length - 1];
    return processedData.map.get(last.time) || null;
  }, [processedData]);

  // Initialize Lightweight Charts instance
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#090d16' },
        textColor: '#94a3b8',
        attributionLogo: true,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          visible: true,
          labelVisible: true,
          style: LineStyle.Dashed,
          color: '#475569',
          width: 1,
        },
        horzLine: {
          visible: true,
          labelVisible: true,
          style: LineStyle.Dashed,
          color: '#475569',
          width: 1,
        },
      },
      rightPriceScale: {
        visible: true,
        borderColor: '#1e293b',
      },
      timeScale: {
        visible: true,
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.35)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.35)' },
      },
    });

    const candleSeries = chart.addSeries(
      CandlestickSeries,
      {
        upColor: '#10b981',
        downColor: '#f43f5e',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#f43f5e',
        priceFormat: {
          type: 'price',
          precision: decimals,
          minMove: 1 / Math.pow(10, decimals),
        },
      },
      0
    );

    const volumeSeries = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: 'volume' },
        priceScaleId: 'right',
      },
      1
    );

    const panes = chart.panes();
    if (panes.length > 1) {
      panes[0].setStretchFactor(4);
      panes[1].setStretchFactor(1);
    }

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const crosshairHandler = (param: MouseEventParams<Time>) => {
      if (!param || !param.point || !param.time) {
        setHoveredData(null);
        return;
      }
      const found = legendMapRef.current.get(Number(param.time));
      setHoveredData(found || null);
    };

    const clickHandler = (param: MouseEventParams<Time>) => {
      const mode = pickModeRef.current;
      if (!mode || !param?.point || !candleSeriesRef.current) return;
      if (param.paneIndex !== undefined && param.paneIndex !== 0) return;
      const rawPrice = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (rawPrice === null || rawPrice === undefined || !Number.isFinite(rawPrice) || rawPrice <= 0) {
        return;
      }
      const rounded = Number(rawPrice.toFixed(decimalsRef.current));
      onPickPriceRef.current(mode, rounded);
    };

    chart.subscribeCrosshairMove(crosshairHandler);
    chart.subscribeClick(clickHandler);

    return () => {
      chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.unsubscribeClick(clickHandler);
      entryLineRef.current = null;
      slLineRef.current = null;
      tpLineRef.current = null;
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [decimals]);

  // Update series data when candles or timeframe change
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    if (processedData.items.length === 0) {
      candleSeriesRef.current.setData([]);
      volumeSeriesRef.current.setData([]);
      return;
    }

    const candleData: CandlestickData<UTCTimestamp>[] = processedData.items.map(c => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData: HistogramData<UTCTimestamp>[] = processedData.items.map(c => ({
      time: c.time as UTCTimestamp,
      value: c.volume || 0,
      color: c.close >= c.open ? '#10b981' : '#f43f5e',
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);
    chartRef.current?.timeScale().fitContent();
  }, [processedData, symbol, timeframe]);

  // Sync horizontal price lines (Entry = blue, SL = red, TP = green)
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    const clearLine = (ref: React.MutableRefObject<IPriceLine | null>) => {
      if (ref.current) {
        try {
          series.removePriceLine(ref.current);
        } catch {}
        ref.current = null;
      }
    };

    clearLine(entryLineRef);
    clearLine(slLineRef);
    clearLine(tpLineRef);

    if (entryPrice !== null && Number.isFinite(entryPrice) && entryPrice > 0) {
      entryLineRef.current = series.createPriceLine({
        price: entryPrice,
        color: '#38bdf8',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `Entry ${entryPrice.toFixed(decimals)}`,
      });
    }

    if (stopPrice !== null && Number.isFinite(stopPrice) && stopPrice > 0) {
      slLineRef.current = series.createPriceLine({
        price: stopPrice,
        color: '#f43f5e',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `SL ${stopPrice.toFixed(decimals)}`,
      });
    }

    if (takeProfitPrice !== null && Number.isFinite(takeProfitPrice) && takeProfitPrice > 0) {
      tpLineRef.current = series.createPriceLine({
        price: takeProfitPrice,
        color: '#10b981',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `TP ${takeProfitPrice.toFixed(decimals)}`,
      });
    }
  }, [entryPrice, stopPrice, takeProfitPrice, decimals, processedData]);

  const activeLegend = hoveredData || latestEntry;
  const formatPrice = (p: number) => p.toFixed(decimals);

  const activeModeLabel =
    pickMode === 'entry'
      ? 'Entry (ฟ้า)'
      : pickMode === 'sl'
      ? 'SL (แดง)'
      : pickMode === 'tp'
      ? 'TP (เขียว)'
      : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg select-none">
      {/* Toolbar: Timeframes + Click-to-Set Mode Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-b border-slate-800 bg-slate-950/70 text-xs">
        {/* Timeframe Selector */}
        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
          {availableTimeframes.map(tf => (
            <button
              key={tf}
              type="button"
              onClick={() => onTimeframeChange(tf)}
              className={`px-2.5 py-1 rounded-md font-mono text-[11px] font-bold transition-colors cursor-pointer ${
                timeframe === tf
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {TF_LABELS[tf]}
            </button>
          ))}
        </div>

        {/* Mode Buttons: [ตั้ง Entry] [ตั้ง SL] [ตั้ง TP] [ยกเลิกโหมด] */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPickMode(prev => (prev === 'entry' ? null : 'entry'))}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border font-bold text-[11px] transition-all cursor-pointer ${
              pickMode === 'entry'
                ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-md shadow-sky-500/20'
                : 'bg-slate-900 text-sky-300 border-sky-500/40 hover:bg-sky-500/15'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>ตั้ง Entry</span>
          </button>

          <button
            type="button"
            onClick={() => setPickMode(prev => (prev === 'sl' ? null : 'sl'))}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border font-bold text-[11px] transition-all cursor-pointer ${
              pickMode === 'sl'
                ? 'bg-rose-500 text-slate-950 border-rose-400 shadow-md shadow-rose-500/20'
                : 'bg-slate-900 text-rose-300 border-rose-500/40 hover:bg-rose-500/15'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>ตั้ง SL</span>
          </button>

          <button
            type="button"
            onClick={() => setPickMode(prev => (prev === 'tp' ? null : 'tp'))}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border font-bold text-[11px] transition-all cursor-pointer ${
              pickMode === 'tp'
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                : 'bg-slate-900 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/15'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>ตั้ง TP</span>
          </button>

          {pickMode !== null && (
            <button
              type="button"
              onClick={() => setPickMode(null)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-[11px] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>ยกเลิกโหมด (Esc)</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Mode Hint Banner */}
      {activeModeLabel && (
        <div className="px-3 py-1.5 bg-slate-950 border-b border-slate-800 text-[11px] text-amber-300 flex items-center justify-between">
          <span>
            โหมดเลือกบนกราฟ: กดจุดบนกราฟเพื่อกำหนดค่า <strong>{activeModeLabel}</strong> (กดจุดใหม่เพื่อเขียนทับค่าเดิม)
          </span>
          <span className="text-slate-400 font-mono">กด Esc เพื่อยกเลิก</span>
        </div>
      )}

      {/* Chart Canvas Area */}
      <div
        className={`relative w-full h-[380px] bg-slate-950 ${pickMode ? 'cursor-crosshair' : ''}`}
        onMouseLeave={() => setHoveredData(null)}
      >
        {activeLegend && (
          <div className="absolute top-2 left-2.5 z-20 pointer-events-none flex flex-wrap items-center gap-x-2.5 gap-y-0.5 bg-slate-950/85 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-slate-800/80 text-[11px] font-mono shadow">
            <span className="font-bold text-slate-200">{symbol}</span>
            <span className="text-slate-400">{activeLegend.timeStr}</span>
            <span className="text-slate-400">
              O <span className="text-slate-200">{formatPrice(activeLegend.open)}</span>
            </span>
            <span className="text-slate-400">
              H <span className="text-slate-200">{formatPrice(activeLegend.high)}</span>
            </span>
            <span className="text-slate-400">
              L <span className="text-slate-200">{formatPrice(activeLegend.low)}</span>
            </span>
            <span className="text-slate-400">
              C <span className="text-slate-200">{formatPrice(activeLegend.close)}</span>
            </span>
            <span className={`font-bold ${activeLegend.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {activeLegend.changePct >= 0 ? '+' : ''}
              {activeLegend.changePct.toFixed(2)}%
            </span>
          </div>
        )}

        {(isLoading || processedData.items.length === 0) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/80 text-slate-400 text-xs">
            <RefreshCw className={`w-5 h-5 mb-1.5 text-amber-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'กำลังโหลดกราฟ...' : 'ไม่พบข้อมูลแท่งเทียนสำหรับช่วงเวลานี้'}</span>
          </div>
        )}

        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
};
