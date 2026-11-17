import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  BaselineSeries,
  CrosshairMode,
  ColorType,
  LineStyle,
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  IPriceLine,
  UTCTimestamp,
  CandlestickData,
  HistogramData,
  LineData,
  BaselineData,
  WhitespaceData,
  SeriesMarker,
  MouseEventParams,
  Time,
} from 'lightweight-charts';
import { Candle } from '../types/trading';
import { calculateEMA, calculateRSI } from '../services/marketData';
import { DailyRsiEvaluation, TierRrEvaluation } from '../services/entryTiers';
import { Crosshair, RefreshCw, X } from 'lucide-react';

export type TierChartTimeframe = '1w' | '1d' | '4h' | '1h';
export type PricePickMode = 'entry' | 'sl' | 'tp' | null;

export interface EntryTierChartIndicators {
  ema20: boolean;
  ema50: boolean;
  ema100: boolean;
  ema200: boolean;
  volume: boolean;
  rsi: boolean;
  swings: boolean;
  rrZone: boolean;
}

const CHART_INDICATORS_STORAGE_KEY = 'apextrade_entry_tiers_chart_indicators_v1';

const DEFAULT_INDICATORS: EntryTierChartIndicators = {
  ema20: true,
  ema50: true,
  ema100: false,
  ema200: false,
  volume: true,
  rsi: true,
  swings: true,
  rrZone: true,
};

function loadChartIndicators(): EntryTierChartIndicators {
  try {
    const raw = localStorage.getItem(CHART_INDICATORS_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_INDICATORS, ...JSON.parse(raw) };
    }
  } catch {}
  return { ...DEFAULT_INDICATORS };
}

function saveChartIndicators(ind: EntryTierChartIndicators): void {
  try {
    localStorage.setItem(CHART_INDICATORS_STORAGE_KEY, JSON.stringify(ind));
  } catch {}
}

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
  rrEval: TierRrEvaluation;
  dailyRsi: DailyRsiEvaluation;
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
  volume: number;
  ema20: number | null;
  ema50: number | null;
  ema100: number | null;
  ema200: number | null;
  rsi: number | null;
}

const TF_LABELS: Record<TierChartTimeframe, string> = {
  '1w': 'Weekly',
  '1d': 'Daily',
  '4h': 'H4',
  '1h': 'H1',
};

const EMA_CONFIGS = [
  { key: 'ema20' as const, period: 20, label: 'EMA20', color: '#f59e0b' },
  { key: 'ema50' as const, period: 50, label: 'EMA50', color: '#a855f7' },
  { key: 'ema100' as const, period: 100, label: 'EMA100', color: '#22d3ee' },
  { key: 'ema200' as const, period: 200, label: 'EMA200', color: '#ec4899' },
];

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
  rrEval,
  dailyRsi,
  onPickPrice,
  isLoading = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  const ema20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema100SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const rrSlZoneSeriesRef = useRef<ISeriesApi<'Baseline'> | null>(null);
  const rrTpZoneSeriesRef = useRef<ISeriesApi<'Baseline'> | null>(null);

  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const volumeMaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const rsiHighZoneRef = useRef<ISeriesApi<'Baseline'> | null>(null);
  const rsiLowZoneRef = useRef<ISeriesApi<'Baseline'> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const entryLineRef = useRef<IPriceLine | null>(null);
  const slLineRef = useRef<IPriceLine | null>(null);
  const tpLineRef = useRef<IPriceLine | null>(null);

  const [indicators, setIndicators] = useState<EntryTierChartIndicators>(() => loadChartIndicators());
  const [pickMode, setPickMode] = useState<PricePickMode>(null);
  const [hoveredData, setHoveredData] = useState<LegendEntry | null>(null);
  const [paneLayout, setPaneLayout] = useState<{ volTop: number; volHeight: number; rsiTop: number; rsiHeight: number }>({
    volTop: 0,
    volHeight: 0,
    rsiTop: 0,
    rsiHeight: 0,
  });

  const pickModeRef = useRef<PricePickMode>(null);
  pickModeRef.current = pickMode;

  const onPickPriceRef = useRef(onPickPrice);
  onPickPriceRef.current = onPickPrice;

  const decimalsRef = useRef(decimals);
  decimalsRef.current = decimals;

  const toggleIndicator = (key: keyof EntryTierChartIndicators) => {
    setIndicators(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveChartIndicators(next);
      return next;
    });
  };

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

  // Deduplicate, sort, and precompute EMAs, RSI, Vol MA20, Swing High/Low
  const processedData = useMemo(() => {
    if (!candles || candles.length === 0) {
      return {
        items: [] as Candle[],
        map: new Map<number, LegendEntry>(),
        ema20: [] as (number | null)[],
        ema50: [] as (number | null)[],
        ema100: [] as (number | null)[],
        ema200: [] as (number | null)[],
        rsi: [] as (number | null)[],
        volMa20: [] as (number | null)[],
        hasVolumeData: false,
        swingMarkers: [] as SeriesMarker<Time>[],
      };
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

    const closes = unique.map(c => c.close);
    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);
    const ema100 = calculateEMA(closes, 100);
    const ema200 = calculateEMA(closes, 200);
    const rsi = calculateRSI(closes, 14);

    // Volume check & Volume MA(20)
    const hasVolumeData = unique.some(c => (c.volume || 0) > 0);
    const volMa20: (number | null)[] = [];
    let volSum = 0;
    for (let i = 0; i < unique.length; i++) {
      volSum += unique[i].volume || 0;
      if (i >= 20) volSum -= unique[i - 20].volume || 0;
      volMa20.push(i >= 19 ? volSum / 20 : null);
    }

    // Swing High / Swing Low (strictly higher/lower than 3 bars on left & 3 bars on right)
    const swingMarkers: SeriesMarker<Time>[] = [];
    for (let i = 3; i < unique.length - 3; i++) {
      const cur = unique[i];
      let isSwingHigh = true;
      let isSwingLow = true;
      for (let offset = 1; offset <= 3; offset++) {
        if (cur.high <= unique[i - offset].high || cur.high <= unique[i + offset].high) {
          isSwingHigh = false;
        }
        if (cur.low >= unique[i - offset].low || cur.low >= unique[i + offset].low) {
          isSwingLow = false;
        }
        if (!isSwingHigh && !isSwingLow) break;
      }
      if (isSwingHigh) {
        swingMarkers.push({
          time: cur.time as UTCTimestamp,
          position: 'aboveBar',
          color: '#fb7185',
          shape: 'arrowDown',
          size: 1,
          text: 'SH',
        });
      }
      if (isSwingLow) {
        swingMarkers.push({
          time: cur.time as UTCTimestamp,
          position: 'belowBar',
          color: '#34d399',
          shape: 'arrowUp',
          size: 1,
          text: 'SwL',
        });
      }
    }

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

    const map = new Map<number, LegendEntry>();
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
        volume: c.volume || 0,
        ema20: ema20[i],
        ema50: ema50[i],
        ema100: ema100[i],
        ema200: ema200[i],
        rsi: rsi[i],
      });
    });

    return {
      items: unique,
      map,
      ema20,
      ema50,
      ema100,
      ema200,
      rsi,
      volMa20,
      hasVolumeData,
      swingMarkers,
    };
  }, [candles, timeframe]);

  const legendMapRef = useRef<Map<number, LegendEntry>>(processedData.map);
  legendMapRef.current = processedData.map;

  const latestEntry = useMemo<LegendEntry | null>(() => {
    if (processedData.items.length === 0) return null;
    const last = processedData.items[processedData.items.length - 1];
    return processedData.map.get(last.time) || null;
  }, [processedData]);

  // Helper to read pane heights for Volume/RSI overlays
  const updatePaneLayout = () => {
    const chart = chartRef.current;
    if (!chart) return;
    const panes = chart.panes();
    let offset = 0;
    let volTop = 0;
    let volHeight = 0;
    let rsiTop = 0;
    let rsiHeight = 0;

    const volPaneIdx = indicators.volume ? 1 : -1;
    const rsiPaneIdx = indicators.rsi ? (indicators.volume ? 2 : 1) : -1;

    panes.forEach((p, idx) => {
      const h = p.getHeight();
      if (idx === volPaneIdx) {
        volTop = offset;
        volHeight = h;
      }
      if (idx === rsiPaneIdx) {
        rsiTop = offset;
        rsiHeight = h;
      }
      offset += h;
    });

    setPaneLayout({ volTop, volHeight, rsiTop, rsiHeight });
  };

  // Initialize Lightweight Charts instance (rebuilds only when decimals or pane toggles change)
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

    // Pane 0: R/R zone shading series (behind candlesticks)
    const rrSlZoneSeries = chart.addSeries(
      BaselineSeries,
      {
        baseValue: { type: 'price', price: 0 },
        topFillColor1: 'rgba(244, 63, 94, 0.14)',
        topFillColor2: 'rgba(244, 63, 94, 0.14)',
        bottomFillColor1: 'rgba(244, 63, 94, 0.14)',
        bottomFillColor2: 'rgba(244, 63, 94, 0.14)',
        topLineColor: 'transparent',
        bottomLineColor: 'transparent',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        autoscaleInfoProvider: () => null,
      },
      0
    );

    const rrTpZoneSeries = chart.addSeries(
      BaselineSeries,
      {
        baseValue: { type: 'price', price: 0 },
        topFillColor1: 'rgba(16, 185, 129, 0.14)',
        topFillColor2: 'rgba(16, 185, 129, 0.14)',
        bottomFillColor1: 'rgba(16, 185, 129, 0.14)',
        bottomFillColor2: 'rgba(16, 185, 129, 0.14)',
        topLineColor: 'transparent',
        bottomLineColor: 'transparent',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        autoscaleInfoProvider: () => null,
      },
      0
    );

    // Pane 0: Candlesticks
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

    // Swing markers plugin on candlestick series
    const markersPlugin = createSeriesMarkers(candleSeries, []);

    // Pane 0: EMA 20 / 50 / 100 / 200
    const createEmaSeries = (color: string) =>
      chart.addSeries(
        LineSeries,
        {
          color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        0
      );

    const ema20Series = createEmaSeries('#f59e0b');
    const ema50Series = createEmaSeries('#a855f7');
    const ema100Series = createEmaSeries('#22d3ee');
    const ema200Series = createEmaSeries('#ec4899');

    // Pane 1 (optional): Volume + Volume MA20
    let volumeSeries: ISeriesApi<'Histogram'> | null = null;
    let volumeMaSeries: ISeriesApi<'Line'> | null = null;
    let nextPaneIdx = 1;

    if (indicators.volume) {
      volumeSeries = chart.addSeries(
        HistogramSeries,
        {
          priceFormat: { type: 'volume' },
          priceScaleId: 'right',
        },
        nextPaneIdx
      );
      volumeMaSeries = chart.addSeries(
        LineSeries,
        {
          color: '#f59e0b',
          lineWidth: 1,
          priceFormat: { type: 'volume' },
          priceScaleId: 'right',
          priceLineVisible: false,
          lastValueVisible: false,
        },
        nextPaneIdx
      );
      nextPaneIdx += 1;
    }

    // Pane 2 (optional): RSI 14 + <=35 / >=65 shaded zones + dashed 30/70 lines
    let rsiHighZone: ISeriesApi<'Baseline'> | null = null;
    let rsiLowZone: ISeriesApi<'Baseline'> | null = null;
    let rsiSeries: ISeriesApi<'Line'> | null = null;

    if (indicators.rsi) {
      const rsiPaneIdx = nextPaneIdx;
      rsiHighZone = chart.addSeries(
        BaselineSeries,
        {
          baseValue: { type: 'price', price: 65 },
          topFillColor1: 'rgba(244, 63, 94, 0.16)',
          topFillColor2: 'rgba(244, 63, 94, 0.08)',
          bottomFillColor1: 'transparent',
          bottomFillColor2: 'transparent',
          topLineColor: 'transparent',
          bottomLineColor: 'transparent',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        },
        rsiPaneIdx
      );

      rsiLowZone = chart.addSeries(
        BaselineSeries,
        {
          baseValue: { type: 'price', price: 35 },
          topFillColor1: 'transparent',
          topFillColor2: 'transparent',
          bottomFillColor1: 'rgba(16, 185, 129, 0.08)',
          bottomFillColor2: 'rgba(16, 185, 129, 0.16)',
          topLineColor: 'transparent',
          bottomLineColor: 'transparent',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        },
        rsiPaneIdx
      );

      rsiSeries = chart.addSeries(
        LineSeries,
        {
          color: '#38bdf8',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        },
        rsiPaneIdx
      );

      rsiSeries.createPriceLine({
        price: 70,
        color: '#f43f5e',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '70',
      });
      rsiSeries.createPriceLine({
        price: 30,
        color: '#10b981',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '30',
      });
    }

    // Set stretch factors across active panes
    const panes = chart.panes();
    if (panes.length > 0) panes[0].setStretchFactor(4);
    for (let i = 1; i < panes.length; i++) {
      panes[i].setStretchFactor(1);
    }

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    markersPluginRef.current = markersPlugin;
    ema20SeriesRef.current = ema20Series;
    ema50SeriesRef.current = ema50Series;
    ema100SeriesRef.current = ema100Series;
    ema200SeriesRef.current = ema200Series;
    rrSlZoneSeriesRef.current = rrSlZoneSeries;
    rrTpZoneSeriesRef.current = rrTpZoneSeries;
    volumeSeriesRef.current = volumeSeries;
    volumeMaSeriesRef.current = volumeMaSeries;
    rsiHighZoneRef.current = rsiHighZone;
    rsiLowZoneRef.current = rsiLowZone;
    rsiSeriesRef.current = rsiSeries;

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

    // Track pane heights on resize / initial layout
    const rafId = requestAnimationFrame(updatePaneLayout);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        updatePaneLayout();
      });
      ro.observe(containerRef.current);
    }

    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.unsubscribeClick(clickHandler);
      markersPlugin.detach();
      markersPluginRef.current = null;
      entryLineRef.current = null;
      slLineRef.current = null;
      tpLineRef.current = null;
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      ema20SeriesRef.current = null;
      ema50SeriesRef.current = null;
      ema100SeriesRef.current = null;
      ema200SeriesRef.current = null;
      rrSlZoneSeriesRef.current = null;
      rrTpZoneSeriesRef.current = null;
      volumeSeriesRef.current = null;
      volumeMaSeriesRef.current = null;
      rsiHighZoneRef.current = null;
      rsiLowZoneRef.current = null;
      rsiSeriesRef.current = null;
    };
  }, [decimals, indicators.volume, indicators.rsi]);

  // Populate series data when candles, timeframe, or pane structure changes
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    const toLineData = (arr: (number | null)[]): (LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[] =>
      processedData.items.map((c, i) => {
        const val = arr[i];
        const time = c.time as UTCTimestamp;
        return val !== null && val !== undefined && Number.isFinite(val) ? { time, value: val } : { time };
      });

    if (processedData.items.length === 0) {
      candleSeriesRef.current.setData([]);
      ema20SeriesRef.current?.setData([]);
      ema50SeriesRef.current?.setData([]);
      ema100SeriesRef.current?.setData([]);
      ema200SeriesRef.current?.setData([]);
      volumeSeriesRef.current?.setData([]);
      volumeMaSeriesRef.current?.setData([]);
      rsiHighZoneRef.current?.setData([]);
      rsiLowZoneRef.current?.setData([]);
      rsiSeriesRef.current?.setData([]);
      return;
    }

    const candleData: CandlestickData<UTCTimestamp>[] = processedData.items.map(c => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    candleSeriesRef.current.setData(candleData);
    ema20SeriesRef.current?.setData(toLineData(processedData.ema20));
    ema50SeriesRef.current?.setData(toLineData(processedData.ema50));
    ema100SeriesRef.current?.setData(toLineData(processedData.ema100));
    ema200SeriesRef.current?.setData(toLineData(processedData.ema200));

    if (volumeSeriesRef.current && volumeMaSeriesRef.current) {
      if (processedData.hasVolumeData) {
        const volumeData: HistogramData<UTCTimestamp>[] = processedData.items.map(c => ({
          time: c.time as UTCTimestamp,
          value: c.volume || 0,
          color: c.close >= c.open ? '#10b981' : '#f43f5e',
        }));
        volumeSeriesRef.current.setData(volumeData);
        volumeMaSeriesRef.current.setData(toLineData(processedData.volMa20));
      } else {
        volumeSeriesRef.current.setData([]);
        volumeMaSeriesRef.current.setData([]);
      }
    }

    if (rsiSeriesRef.current && rsiHighZoneRef.current && rsiLowZoneRef.current) {
      const highBand: BaselineData<UTCTimestamp>[] = processedData.items.map(c => ({
        time: c.time as UTCTimestamp,
        value: 100,
      }));
      const lowBand: BaselineData<UTCTimestamp>[] = processedData.items.map(c => ({
        time: c.time as UTCTimestamp,
        value: 0,
      }));
      rsiHighZoneRef.current.setData(highBand);
      rsiLowZoneRef.current.setData(lowBand);
      rsiSeriesRef.current.setData(toLineData(processedData.rsi));
    }

    chartRef.current?.timeScale().fitContent();
    requestAnimationFrame(updatePaneLayout);
  }, [processedData, symbol, timeframe, indicators.volume, indicators.rsi]);

  // Toggle EMA visibility without recreating chart
  useEffect(() => {
    ema20SeriesRef.current?.applyOptions({ visible: indicators.ema20 });
    ema50SeriesRef.current?.applyOptions({ visible: indicators.ema50 });
    ema100SeriesRef.current?.applyOptions({ visible: indicators.ema100 });
    ema200SeriesRef.current?.applyOptions({ visible: indicators.ema200 });
  }, [indicators.ema20, indicators.ema50, indicators.ema100, indicators.ema200]);

  // Toggle Swing High / Swing Low markers
  useEffect(() => {
    if (!markersPluginRef.current) return;
    markersPluginRef.current.setMarkers(indicators.swings ? processedData.swingMarkers : []);
  }, [indicators.swings, processedData.swingMarkers]);

  // Sync Entry / SL / TP horizontal price lines and R/R shaded zones
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

    const hasEntry = entryPrice !== null && Number.isFinite(entryPrice) && entryPrice > 0;
    const hasSl = stopPrice !== null && Number.isFinite(stopPrice) && stopPrice > 0;
    const hasTp = takeProfitPrice !== null && Number.isFinite(takeProfitPrice) && takeProfitPrice > 0;

    const formatSignedDistance = (target: number, base: number): string => {
      const diff = target - base;
      const pct = (diff / base) * 100;
      const signDiff = diff >= 0 ? '+' : '−';
      const signPct = pct >= 0 ? '+' : '−';
      return `${signDiff}${Math.abs(diff).toFixed(decimals)} (${signPct}${Math.abs(pct).toFixed(2)}%)`;
    };

    if (hasEntry && entryPrice !== null) {
      entryLineRef.current = series.createPriceLine({
        price: entryPrice,
        color: '#38bdf8',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `Entry ${entryPrice.toFixed(decimals)}`,
      });
    }

    if (hasSl && stopPrice !== null) {
      const slTitle =
        hasEntry && entryPrice !== null
          ? `SL ${formatSignedDistance(stopPrice, entryPrice)}`
          : `SL ${stopPrice.toFixed(decimals)}`;
      slLineRef.current = series.createPriceLine({
        price: stopPrice,
        color: '#f43f5e',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: slTitle,
      });
    }

    if (hasTp && takeProfitPrice !== null) {
      const tpTitle =
        hasEntry && entryPrice !== null
          ? `TP ${formatSignedDistance(takeProfitPrice, entryPrice)}`
          : `TP ${takeProfitPrice.toFixed(decimals)}`;
      tpLineRef.current = series.createPriceLine({
        price: takeProfitPrice,
        color: '#10b981',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: tpTitle,
      });
    }

    // R/R shaded bands between Entry-SL (red) and Entry-TP (green)
    if (rrSlZoneSeriesRef.current) {
      if (indicators.rrZone && hasEntry && hasSl && entryPrice !== null && stopPrice !== null && processedData.items.length > 0) {
        rrSlZoneSeriesRef.current.applyOptions({
          baseValue: { type: 'price', price: entryPrice },
          visible: true,
        });
        rrSlZoneSeriesRef.current.setData(
          processedData.items.map(c => ({ time: c.time as UTCTimestamp, value: stopPrice }))
        );
      } else {
        rrSlZoneSeriesRef.current.setData([]);
      }
    }

    if (rrTpZoneSeriesRef.current) {
      if (indicators.rrZone && hasEntry && hasTp && entryPrice !== null && takeProfitPrice !== null && processedData.items.length > 0) {
        rrTpZoneSeriesRef.current.applyOptions({
          baseValue: { type: 'price', price: entryPrice },
          visible: true,
        });
        rrTpZoneSeriesRef.current.setData(
          processedData.items.map(c => ({ time: c.time as UTCTimestamp, value: takeProfitPrice }))
        );
      } else {
        rrTpZoneSeriesRef.current.setData([]);
      }
    }
  }, [entryPrice, stopPrice, takeProfitPrice, decimals, processedData, indicators.rrZone, indicators.volume, indicators.rsi]);

  const activeLegend = hoveredData || latestEntry;
  const formatPrice = (p: number) => p.toFixed(decimals);
  const formatVolume = (v: number): string => {
    if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const activeModeLabel =
    pickMode === 'entry'
      ? 'Entry (ฟ้า)'
      : pickMode === 'sl'
      ? 'SL (แดง)'
      : pickMode === 'tp'
      ? 'TP (เขียว)'
      : null;

  const chartHeightClass =
    indicators.volume && indicators.rsi
      ? 'h-[500px]'
      : indicators.volume || indicators.rsi
      ? 'h-[430px]'
      : 'h-[370px]';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg select-none">
      {/* Top Toolbar: Timeframes + Click-to-Set Mode Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-800 bg-slate-950/70 text-xs">
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

      {/* Indicator Toggle Strip (Persisted separately for Entry Tiers) */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b border-slate-800/80 bg-slate-950/40 text-[11px]">
        {EMA_CONFIGS.map(cfg => {
          const on = indicators[cfg.key];
          return (
            <button
              key={cfg.key}
              type="button"
              onClick={() => toggleIndicator(cfg.key)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono font-semibold transition-colors cursor-pointer ${
                on
                  ? 'bg-slate-900 text-white border-slate-600'
                  : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
              }`}
            >
              <span
                className="w-2 h-0.5 rounded-full inline-block"
                style={{ backgroundColor: on ? cfg.color : '#475569' }}
              />
              <span>{cfg.label}</span>
            </button>
          );
        })}

        <span className="text-slate-700">|</span>

        <button
          type="button"
          onClick={() => toggleIndicator('volume')}
          className={`px-2 py-0.5 rounded border font-semibold transition-colors cursor-pointer ${
            indicators.volume
              ? 'bg-slate-900 text-amber-300 border-amber-500/40'
              : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
          }`}
        >
          Volume + MA20
        </button>

        <button
          type="button"
          onClick={() => toggleIndicator('rsi')}
          className={`px-2 py-0.5 rounded border font-semibold transition-colors cursor-pointer ${
            indicators.rsi
              ? 'bg-slate-900 text-sky-300 border-sky-500/40'
              : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
          }`}
        >
          RSI 14
        </button>

        <button
          type="button"
          onClick={() => toggleIndicator('swings')}
          className={`px-2 py-0.5 rounded border font-semibold transition-colors cursor-pointer ${
            indicators.swings
              ? 'bg-slate-900 text-emerald-300 border-emerald-500/40'
              : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
          }`}
        >
          Swing H/L
        </button>

        <button
          type="button"
          onClick={() => toggleIndicator('rrZone')}
          className={`px-2 py-0.5 rounded border font-semibold transition-colors cursor-pointer ${
            indicators.rrZone
              ? 'bg-slate-900 text-cyan-300 border-cyan-500/40'
              : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
          }`}
        >
          โซน R/R
        </button>
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
        className={`relative w-full ${chartHeightClass} bg-slate-950 ${pickMode ? 'cursor-crosshair' : ''}`}
        onMouseLeave={() => setHoveredData(null)}
      >
        {/* Top-Left Legend Overlay (OHLC + active EMAs + RSI + Volume) */}
        {activeLegend && (
          <div className="absolute top-2 left-2.5 z-20 pointer-events-none flex flex-wrap items-center gap-x-2.5 gap-y-0.5 max-w-[78%] bg-slate-950/85 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-slate-800/80 text-[11px] font-mono shadow">
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

            {EMA_CONFIGS.map(cfg => {
              if (!indicators[cfg.key]) return null;
              const val = activeLegend[cfg.key];
              return (
                <span key={cfg.key} style={{ color: cfg.color }}>
                  {cfg.label} <span>{val !== null ? formatPrice(val) : '-'}</span>
                </span>
              );
            })}

            {indicators.rsi && (
              <span className="text-sky-300">
                RSI(14) <span>{activeLegend.rsi !== null ? activeLegend.rsi.toFixed(1) : '-'}</span>
              </span>
            )}

            {indicators.volume && (
              <span className="text-slate-300">
                Vol <span>{processedData.hasVolumeData ? formatVolume(activeLegend.volume) : '-'}</span>
              </span>
            )}
          </div>
        )}

        {/* Top-Right R/R Summary Badge (from evaluateTierRR) */}
        {indicators.rrZone && (entryPrice !== null || stopPrice !== null || takeProfitPrice !== null) && (
          <div
            className={`absolute top-2 right-16 z-20 pointer-events-none px-2.5 py-1 rounded-lg border text-[11px] font-mono font-bold shadow ${
              rrEval.valid && rrEval.meetsMinimum3
                ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-300'
                : rrEval.valid && !rrEval.meetsMinimum3
                ? 'bg-rose-950/90 border-rose-500/60 text-rose-300'
                : rrEval.errorMessage && entryPrice !== null && stopPrice !== null && takeProfitPrice !== null
                ? 'bg-rose-950/90 border-rose-500/60 text-rose-300'
                : 'bg-slate-950/85 border-slate-700 text-slate-300'
            }`}
          >
            {rrEval.rrRatio !== null
              ? `R/R 1 : ${rrEval.rrRatio}${rrEval.meetsMinimum3 ? ' ✓' : ' (< 1:3)'}`
              : rrEval.errorMessage && entryPrice !== null && stopPrice !== null && takeProfitPrice !== null
              ? rrEval.errorMessage
              : 'R/R -'}
          </div>
        )}

        {/* Volume Pane No-Data Notice */}
        {indicators.volume && !processedData.hasVolumeData && processedData.items.length > 0 && paneLayout.volHeight > 0 && (
          <div
            className="absolute left-0 right-14 z-10 pointer-events-none flex items-center justify-center"
            style={{ top: `${paneLayout.volTop}px`, height: `${paneLayout.volHeight}px` }}
          >
            <span className="px-3 py-1 rounded-lg bg-slate-900/90 border border-slate-700 text-[11px] text-slate-400">
              ไม่มีข้อมูล volume สำหรับสินทรัพย์นี้
            </span>
          </div>
        )}

        {/* RSI Pane Header Badge (always shows latest Daily RSI) */}
        {indicators.rsi && processedData.items.length > 0 && paneLayout.rsiHeight > 0 && (
          <div
            className="absolute left-2.5 z-10 pointer-events-none flex flex-wrap items-center gap-2 px-2 py-0.5 rounded bg-slate-950/85 border border-slate-800/80 text-[10px] font-mono"
            style={{ top: `${paneLayout.rsiTop + 4}px` }}
          >
            <span className="text-sky-300 font-bold">
              RSI(14) {TF_LABELS[timeframe]}: {activeLegend?.rsi !== null && activeLegend?.rsi !== undefined ? activeLegend.rsi.toFixed(1) : '-'}
            </span>
            <span className="text-slate-600">|</span>
            <span
              className={
                dailyRsi.zone === 'rebound_zone'
                  ? 'text-emerald-400 font-bold'
                  : dailyRsi.zone === 'resistance_zone'
                  ? 'text-rose-400 font-bold'
                  : 'text-amber-300 font-bold'
              }
            >
              RSI Daily ล่าสุด: {dailyRsi.available && dailyRsi.rsi !== null ? `${dailyRsi.rsi.toFixed(1)} (${dailyRsi.zoneLabel})` : '-'}
            </span>
          </div>
        )}

        {(isLoading || processedData.items.length === 0) && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/80 text-slate-400 text-xs">
            <RefreshCw className={`w-5 h-5 mb-1.5 text-amber-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'กำลังโหลดกราฟ...' : 'ไม่พบข้อมูลแท่งเทียนสำหรับช่วงเวลานี้'}</span>
          </div>
        )}

        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
};
