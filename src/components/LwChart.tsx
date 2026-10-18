import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  ColorType,
  LineStyle,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  CandlestickData,
  HistogramData,
  LineData,
  WhitespaceData,
} from 'lightweight-charts';
import { Candle, PriceAlert, Timeframe } from '../types/trading';
import { Bell, Calendar } from 'lucide-react';

export interface LwChartProps {
  candles: Candle[];
  symbol: string;
  decimals?: number;
  timeframe?: Timeframe;
  onTimeframeChange?: (tf: Timeframe) => void;
  alerts?: PriceAlert[];
  currentPrice?: number;
  onQuickAddAlert?: (price: number) => void;
  onOpenAlertModal?: () => void;
  isLive?: boolean;
  isTimeframeDisabled?: boolean;
  isWeeklyView?: boolean;
  onToggleWeeklyView?: () => void;
  canToggleWeeklyView?: boolean;
}

interface LegendEntry {
  timeStr: string;
  open: number;
  high: number;
  low: number;
  close: number;
  changePct: number;
  volume: number;
  volMa: number | null;
}

export const LwChart: React.FC<LwChartProps> = ({
  candles,
  symbol,
  decimals = 2,
  timeframe = '1d',
  onTimeframeChange,
  alerts = [],
  currentPrice,
  onOpenAlertModal,
  isLive = false,
  isTimeframeDisabled = false,
  isWeeklyView = false,
  onToggleWeeklyView,
  canToggleWeeklyView = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const volumeMaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const [hoveredData, setHoveredData] = useState<LegendEntry | null>(null);

  // Deduplicate and chronologically sort candles
  const processedData = useMemo(() => {
    if (!candles || candles.length === 0) return { items: [], map: new Map<number, LegendEntry>(), volMaArr: [] };

    const sorted = [...candles].sort((a, b) => a.time - b.time);
    const unique: Candle[] = [];
    for (const c of sorted) {
      if (unique.length > 0 && unique[unique.length - 1].time === c.time) {
        unique[unique.length - 1] = c;
      } else {
        unique.push(c);
      }
    }

    // Precompute Volume MA(20) — null for first 19 candles
    const volMaArr: (number | null)[] = [];
    let volSum = 0;
    for (let i = 0; i < unique.length; i++) {
      volSum += unique[i].volume || 0;
      if (i >= 20) {
        volSum -= unique[i - 20].volume || 0;
      }
      if (i >= 19) {
        volMaArr.push(volSum / 20);
      } else {
        volMaArr.push(null);
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
      const tSec = c.time > 1e11 ? Math.floor(c.time / 1000) : Math.floor(c.time);
      const entry: LegendEntry = {
        timeStr: formatTimeStr(tSec),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        changePct,
        volume: c.volume || 0,
        volMa: volMaArr[i],
      };
      map.set(tSec, entry);
    });

    return { items: unique, map, volMaArr };
  }, [candles, timeframe]);

  // Latest candle for fallback legend
  const latestEntry = useMemo<LegendEntry | null>(() => {
    if (processedData.items.length === 0) return null;
    const last = processedData.items[processedData.items.length - 1];
    const tSec = last.time > 1e11 ? Math.floor(last.time / 1000) : Math.floor(last.time);
    return processedData.map.get(tSec) || null;
  }, [processedData]);

  // Initialize Lightweight Charts
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#090d16' },
        textColor: '#94a3b8',
        attributionLogo: true, // License requirement: keep attribution logo enabled
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

    // 1. Candlestick series in main pane (pane index 0)
    const candleSeries = chart.addSeries(CandlestickSeries, {
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
    }, 0);

    // 2. Volume histogram in its own pane below (pane index 1)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'right',
    }, 1);

    // 3. Volume MA(20) line in the same volume pane (pane index 1)
    const volumeMaSeries = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'right',
    }, 1);

    // Set pane stretch factors: 80% main pane, 20% volume pane
    const panes = chart.panes();
    if (panes.length > 1) {
      panes[0].setStretchFactor(4);
      panes[1].setStretchFactor(1);
    }

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    volumeMaSeriesRef.current = volumeMaSeries;

    // Crosshair handler for legend updating
    const crosshairHandler = (param: any) => {
      if (!param || !param.point || !param.time) {
        setHoveredData(null);
        return;
      }
      const timeNum = Number(param.time);
      const found = processedData.map.get(timeNum);
      if (found) {
        setHoveredData(found);
      } else {
        setHoveredData(null);
      }
    };

    chart.subscribeCrosshairMove(crosshairHandler);

    return () => {
      chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      volumeMaSeriesRef.current = null;
    };
  }, [decimals, processedData.map]);

  // Update chart series data when processedData changes
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !volumeMaSeriesRef.current) return;
    if (processedData.items.length === 0) {
      candleSeriesRef.current.setData([]);
      volumeSeriesRef.current.setData([]);
      volumeMaSeriesRef.current.setData([]);
      return;
    }

    const toUTCTimestamp = (t: number): UTCTimestamp =>
      (t > 1e11 ? Math.floor(t / 1000) : Math.floor(t)) as UTCTimestamp;

    // 1. Candlestick data
    const candleData: CandlestickData<UTCTimestamp>[] = processedData.items.map(c => ({
      time: toUTCTimestamp(c.time),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    // 2. Volume data colored by candle direction (green if close >= open, red if close < open)
    const volumeData: HistogramData<UTCTimestamp>[] = processedData.items.map(c => {
      const isUp = c.close >= c.open;
      return {
        time: toUTCTimestamp(c.time),
        value: c.volume || 0,
        color: isUp ? '#10b981' : '#f43f5e',
      };
    });

    // 3. Volume MA(20) data
    const lineData: (LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[] = processedData.items.map((c, i) => {
      const ma = processedData.volMaArr[i];
      const time = toUTCTimestamp(c.time);
      if (ma === null || ma === undefined) {
        return { time };
      }
      return { time, value: ma };
    });

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);
    volumeMaSeriesRef.current.setData(lineData);

    // Fit content on initial load
    chartRef.current?.timeScale().fitContent();
  }, [processedData]);

  // Active legend data: hovered candle or fallback to latest
  const activeLegend = hoveredData || latestEntry;

  const formatPrice = (p: number) =>
    p.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const formatVolume = (v: number): string => {
    if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden select-none">
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-800 bg-slate-950/70 text-xs">
        {/* Timeframe selector */}
        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800/80">
          {(['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              disabled={isTimeframeDisabled}
              onClick={() => onTimeframeChange?.(tf)}
              title={isTimeframeDisabled ? 'Timeframe ถูกกำหนดโดยไฟล์ CSV ของสินทรัพย์นี้' : tf.toUpperCase()}
              className={`px-2.5 py-1 font-mono text-[11px] font-semibold rounded-md transition-colors ${
                isTimeframeDisabled
                  ? 'opacity-35 cursor-not-allowed text-slate-500'
                  : timeframe === tf
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Weekly View Toggle (if CSV is Daily) */}
        {canToggleWeeklyView && (
          <button
            onClick={onToggleWeeklyView}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
              isWeeklyView
                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="รวมแท่ง 1D เป็น 1W (สัปดาห์เริ่มวันจันทร์)"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>มุมมองสัปดาห์ 1W</span>
          </button>
        )}

        {/* Set Price Alert Button */}
        {onOpenAlertModal && (
          <button
            onClick={onOpenAlertModal}
            className="flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Bell className="w-3.5 h-3.5 fill-slate-950" />
            <span>+ ตั้งแจ้งเตือนราคา</span>
          </button>
        )}

        {/* Live WebSocket Indicator */}
        {isLive && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-semibold text-emerald-400 ml-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>LIVE (Binance)</span>
          </div>
        )}
      </div>

      {/* Chart Canvas Area & Top-Left Legend Overlay */}
      <div
        className="relative flex-1 w-full min-h-[500px]"
        onMouseLeave={() => setHoveredData(null)}
      >
        {/* Requirement 4: Top-left Legend that updates on hover */}
        {activeLegend && (
          <div className="absolute top-2.5 left-3 z-20 pointer-events-none flex flex-wrap items-center gap-x-3 gap-y-1 bg-slate-950/85 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-slate-800/80 text-xs font-mono shadow-lg">
            <span className="font-bold text-slate-200">{symbol}</span>
            <span className="text-slate-400 text-[11px]">{activeLegend.timeStr}</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">O <span className="text-slate-200 font-semibold">{formatPrice(activeLegend.open)}</span></span>
              <span className="text-slate-400">H <span className="text-slate-200 font-semibold">{formatPrice(activeLegend.high)}</span></span>
              <span className="text-slate-400">L <span className="text-slate-200 font-semibold">{formatPrice(activeLegend.low)}</span></span>
              <span className="text-slate-400">C <span className="text-slate-200 font-semibold">{formatPrice(activeLegend.close)}</span></span>
            </div>
            <span className={`font-bold ${activeLegend.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {activeLegend.changePct >= 0 ? '+' : ''}{activeLegend.changePct.toFixed(2)}%
            </span>
            <span className="text-slate-400">Vol <span className="text-slate-200">{formatVolume(activeLegend.volume)}</span></span>
            <span className="text-amber-400">Vol MA(20) <span className="text-amber-300">{activeLegend.volMa !== null ? formatVolume(activeLegend.volMa) : '-'}</span></span>
          </div>
        )}

        {/* Lightweight Charts mounting container */}
        <div ref={containerRef} className="w-full h-full min-h-[500px]" />
      </div>
    </div>
  );
};
