import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Candle, ChartType, IndicatorSettings, PriceAlert, Timeframe, TrendLine } from '../types/trading';
import { calculateEMA, calculateBollingerBands, calculateRSI, calculateMACD, TIMEFRAME_SECONDS } from '../services/marketData';
import { 
  Maximize2, 
  Minus, 
  Plus, 
  RotateCcw, 
  Bell, 
  Sliders, 
  Eye, 
  EyeOff, 
  TrendingUp, 
  Activity,
  Layers,
  Compass,
  X,
  AlertTriangle,
  ShieldCheck,
  Calendar,
  Sparkles,
  Trash2,
  Check,
  Undo2,
  Redo2
} from 'lucide-react';

interface TradingChartProps {
  candles: Candle[];
  symbol: string;
  decimals: number;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  alerts: PriceAlert[];
  currentPrice: number;
  onQuickAddAlert: (price: number) => void;
  onOpenAlertModal: () => void;
  isLive: boolean;
  isTimeframeDisabled?: boolean;
  isWeeklyView?: boolean;
  onToggleWeeklyView?: () => void;
  canToggleWeeklyView?: boolean;
}

export const TradingChart: React.FC<TradingChartProps> = ({
  candles,
  symbol,
  decimals,
  timeframe,
  onTimeframeChange,
  alerts,
  currentPrice,
  onQuickAddAlert,
  onOpenAlertModal,
  isLive,
  isTimeframeDisabled = false,
  isWeeklyView = false,
  onToggleWeeklyView,
  canToggleWeeklyView = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const subCanvasRef = useRef<HTMLCanvasElement>(null);

  // Chart configuration state
  const [chartType, setChartType] = useState<ChartType>('candles');
  const [indicators, setIndicators] = useState<IndicatorSettings>({
    showEMA20: true,
    showEMA50: false,
    showEMA100: false,
    showEMA200: false,
    showBollinger: false,
    showRSI: true,
    showMACD: false,
    showVolume: true,
  });
  const [showIndicatorsMenu, setShowIndicatorsMenu] = useState(false);
  const [showBullishEngulfing, setShowBullishEngulfing] = useState<boolean>(true);

  // Trendline drawing state (TradingView style)
  const [trendlines, setTrendlines] = useState<TrendLine[]>([]);
  const [trendlineRedoStack, setTrendlineRedoStack] = useState<TrendLine[]>([]);
  const [isDrawingTrendline, setIsDrawingTrendline] = useState<boolean>(false);
  const [trendlineStart, setTrendlineStart] = useState<{ time: number; price: number } | null>(null);
  const [mousePriceHover, setMousePriceHover] = useState<{ time: number; price: number } | null>(null);
  const [selectedTrendlineId, setSelectedTrendlineId] = useState<string | null>(null);

  // Support & Resistance Tester state
  const [srLevel, setSrLevel] = useState<number | null>(null);
  const [isDrawingSr, setIsDrawingSr] = useState<boolean>(false);
  const [showSrPanel, setShowSrPanel] = useState<boolean>(false);

  // Viewport zoom & pan offset
  const [visibleCount, setVisibleCount] = useState<number>(60);
  const [panOffset, setPanOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [dragStartY, setDragStartY] = useState<number>(0);
  const [dragStartPan, setDragStartPan] = useState<number>(0);
  const [dragStartPricePan, setDragStartPricePan] = useState<number>(0);
  const hasDraggedRef = useRef<boolean>(false);
  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);
  const touchStartPanRef = useRef<number>(0);
  const touchStartPricePanRef = useRef<number>(0);

  // Y-axis vertical stretch & scaling state (TradingView style)
  const [priceScaleMultiplier, setPriceScaleMultiplier] = useState<number>(1.0);
  const [pricePanOffset, setPricePanOffset] = useState<number>(0);
  const [isDraggingYAxis, setIsDraggingYAxis] = useState<boolean>(false);
  const [isHoveringYAxis, setIsHoveringYAxis] = useState<boolean>(false);
  const isDraggingYAxisRef = useRef<boolean>(false);
  const dragStartYRef = useRef<number>(0);
  const dragStartScaleRef = useRef<number>(1.0);
  const dragStartPanOffsetRef = useRef<number>(0);

  // Undo action (Ctrl+Z / Cmd+Z)
  const handleUndo = useCallback(() => {
    // 1. If currently in middle of drawing a trendline, cancel point 1
    if (trendlineStart) {
      setTrendlineStart(null);
      setMousePriceHover(null);
      return;
    }

    // 2. If drawing mode is active, turn it off
    if (isDrawingTrendline) {
      setIsDrawingTrendline(false);
      return;
    }

    if (isDrawingSr) {
      setIsDrawingSr(false);
      return;
    }

    // 3. Pop the last trendline and save into redo stack
    if (trendlines.length > 0) {
      const last = trendlines[trendlines.length - 1];
      setTrendlineRedoStack(prev => [...prev, last]);
      setTrendlines(prev => prev.slice(0, -1));
      setSelectedTrendlineId(null);
      return;
    }

    // 4. If S/R is placed, remove it
    if (srLevel !== null) {
      setSrLevel(null);
      setShowSrPanel(false);
      return;
    }
  }, [trendlineStart, isDrawingTrendline, isDrawingSr, trendlines, srLevel]);

  // Redo action (Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z)
  const handleRedo = useCallback(() => {
    if (trendlineRedoStack.length > 0) {
      const next = trendlineRedoStack[trendlineRedoStack.length - 1];
      setTrendlines(prev => [...prev, next]);
      setTrendlineRedoStack(prev => prev.slice(0, -1));
    }
  }, [trendlineRedoStack]);

  // Global Keyboard shortcuts: Ctrl+Z (Undo) and Ctrl+Y / Ctrl+Shift+Z (Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (isCmdOrCtrl && (e.key === 'z' || e.key === 'Z')) {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if (isCmdOrCtrl && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Global mouse handlers for pan and smooth Y-axis scale dragging
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDraggingYAxisRef.current) {
        const deltaY = e.clientY - dragStartYRef.current;
        // Dragging up (deltaY < 0) stretches the Y axis, dragging down compresses it
        const newScale = Math.max(0.15, Math.min(40, dragStartScaleRef.current * Math.exp(-deltaY * 0.007)));
        setPriceScaleMultiplier(newScale);
      }
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      setIsDraggingYAxis(false);
      isDraggingYAxisRef.current = false;
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  // Mouse crosshair position
  const [crosshair, setCrosshair] = useState<{ 
    x: number; 
    y: number; 
    candle: Candle | null; 
    slotIndex: number;
    source: 'main' | 'sub';
  } | null>(null);

  // Filter alerts for current symbol
  const symbolAlerts = useMemo(() => {
    return alerts.filter(a => a.symbol === symbol && a.status === 'active');
  }, [alerts, symbol]);

  // Handle zoom in/out with pan clamping
  const handleZoom = (delta: number) => {
    setVisibleCount(prev => {
      const next = Math.min(Math.max(20, prev + delta), Math.max(30, candles.length));
      const minPan = -Math.floor(next * 0.85);
      const maxPan = Math.max(0, candles.length - 5);
      setPanOffset(p => Math.max(minPan, Math.min(maxPan, p)));
      return next;
    });
  };

  const handleResetZoom = () => {
    setVisibleCount(60);
    setPanOffset(0);
    setPriceScaleMultiplier(1.0);
    setPricePanOffset(0);
  };

  // Price range calculation factoring in Y-axis vertical scaling & offset
  const getPriceRange = useCallback((candlesList: Candle[]) => {
    let min = Infinity;
    let max = -Infinity;
    candlesList.forEach(c => {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
    });
    if (min === Infinity || max === -Infinity) {
      min = currentPrice * 0.95;
      max = currentPrice * 1.05;
    }
    symbolAlerts.forEach(a => {
      if (a.targetPrice < min && min - a.targetPrice < (max - min) * 0.3) {
        min = a.targetPrice;
      }
      if (a.targetPrice > max && a.targetPrice - max < (max - min) * 0.3) {
        max = a.targetPrice;
      }
    });
    const baseRange = max - min || 1;
    const baseCenter = (max + min) / 2;
    const effectiveRange = (baseRange * 1.1) / priceScaleMultiplier;
    const minPrice = baseCenter - effectiveRange / 2 + pricePanOffset;
    const maxPrice = baseCenter + effectiveRange / 2 + pricePanOffset;
    return { minPrice, maxPrice, paddedRange: maxPrice - minPrice };
  }, [currentPrice, symbolAlerts, priceScaleMultiplier, pricePanOffset]);

  // Slice visible candles according to panOffset and visibleCount
  // When panOffset < 0, candles shift left, creating future blank space on the right
  const visibleCandles = useMemo(() => {
    const total = candles.length;
    if (total === 0) return [];
    const startGlobalIdx = total - panOffset - visibleCount;
    const start = Math.max(0, startGlobalIdx);
    const end = Math.min(total, startGlobalIdx + visibleCount);
    if (start >= end) return [];
    return candles.slice(start, end);
  }, [candles, visibleCount, panOffset]);

  // Indicator series calculated across full data to maintain smoothing
  const indicatorData = useMemo(() => {
    if (candles.length === 0) return null;
    const closes = candles.map(c => c.close);
    
    return {
      ema20: indicators.showEMA20 ? calculateEMA(closes, 20) : null,
      ema50: indicators.showEMA50 ? calculateEMA(closes, 50) : null,
      ema100: indicators.showEMA100 ? calculateEMA(closes, 100) : null,
      ema200: indicators.showEMA200 ? calculateEMA(closes, 200) : null,
      bb: indicators.showBollinger ? calculateBollingerBands(closes, 20, 2) : null,
      rsi: indicators.showRSI ? calculateRSI(closes, 14) : null,
      macd: indicators.showMACD ? calculateMACD(closes) : null,
    };
  }, [candles, indicators]);

  // Main Canvas Rendering Loop
  const drawMainChart = useCallback(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, width, height);

    if (visibleCandles.length === 0) return;

    // Layout constants
    const rightPadding = 75 * dpr;
    const bottomPadding = 25 * dpr;
    const chartWidth = width - rightPadding;
    const chartHeight = height - bottomPadding;
    const slotWidth = chartWidth / visibleCount;
    const candleWidth = Math.max(2 * dpr, slotWidth * 0.72);
    const startGlobalIdx = candles.length - panOffset - visibleCount;
    const startIdx = Math.max(0, startGlobalIdx);
    const endIdx = Math.min(candles.length, startGlobalIdx + visibleCount);

    // Calculate visible Price Range (Min & Max with Y-axis stretch scale)
    let maxVolume = 0;
    visibleCandles.forEach(c => {
      if (c.volume > maxVolume) maxVolume = c.volume;
    });

    const { minPrice, maxPrice, paddedRange } = getPriceRange(visibleCandles);

    const priceToY = (price: number) => {
      return chartHeight - ((price - minPrice) / paddedRange) * chartHeight;
    };

    const yToPrice = (y: number) => {
      return minPrice + (1 - y / chartHeight) * paddedRange;
    };

    // Draw grid lines
    ctx.lineWidth = 1 * dpr;
    ctx.strokeStyle = '#1e293b55'; // subtle hairline slate grid

    const gridSteps = 6;
    for (let i = 0; i <= gridSteps; i++) {
      const y = (chartHeight / gridSteps) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      // Price labels on right axis
      const priceVal = yToPrice(y);
      ctx.fillStyle = '#64748b';
      ctx.font = `${11 * dpr}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(priceVal.toFixed(decimals), chartWidth + 10 * dpr, y);
    }

    // Interactive Right Price Axis subtle background & divider
    ctx.fillStyle = isDraggingYAxis 
      ? 'rgba(6, 182, 212, 0.12)' 
      : isHoveringYAxis 
      ? 'rgba(30, 41, 59, 0.55)' 
      : 'rgba(15, 23, 42, 0.25)';
    ctx.fillRect(chartWidth, 0, rightPadding, chartHeight);
    
    ctx.beginPath();
    ctx.strokeStyle = isDraggingYAxis 
      ? '#06b6d4' 
      : isHoveringYAxis 
      ? 'rgba(56, 189, 248, 0.6)' 
      : '#1e293b';
    ctx.lineWidth = (isDraggingYAxis || isHoveringYAxis ? 1.5 : 1) * dpr;
    ctx.moveTo(chartWidth, 0);
    ctx.lineTo(chartWidth, chartHeight);
    ctx.stroke();

    // Draw vertical time grid lines & date stamps across visibleCount slots
    const timeSlotStep = Math.max(1, Math.floor(visibleCount / 6));
    for (let slot = 0; slot < visibleCount; slot += timeSlotStep) {
      const x = slot * slotWidth + slotWidth / 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, chartHeight);
      ctx.stroke();

      const gIdx = startGlobalIdx + slot;
      let dateForGrid: Date | null = null;
      let isFuture = false;
      if (gIdx >= 0 && gIdx < candles.length) {
        dateForGrid = new Date(candles[gIdx].time * 1000);
      } else if (candles.length > 0 && gIdx >= candles.length) {
        const lastCandle = candles[candles.length - 1];
        const diffBars = gIdx - (candles.length - 1);
        const intervalSec = TIMEFRAME_SECONDS[timeframe] || 86400;
        dateForGrid = new Date((lastCandle.time + diffBars * intervalSec) * 1000);
        isFuture = true;
      }

      if (dateForGrid) {
        const d = dateForGrid;
        const timeStr = timeframe === '1d' || timeframe === '1w' || isWeeklyView
          ? `${d.getMonth() + 1}/${d.getDate()}`
          : `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        ctx.fillStyle = isFuture ? 'rgba(100, 116, 139, 0.45)' : '#64748b';
        ctx.font = `${10 * dpr}px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(timeStr, x, chartHeight + 14 * dpr);
      }
    }

    // Volume bars (at bottom of chart)
    if (indicators.showVolume && maxVolume > 0) {
      const volumeAreaHeight = chartHeight * 0.2;
      for (let gIdx = startIdx; gIdx < endIdx; gIdx++) {
        const c = candles[gIdx];
        const slot = gIdx - startGlobalIdx;
        const x = slot * slotWidth + (slotWidth - candleWidth) / 2;
        const vHeight = (c.volume / maxVolume) * volumeAreaHeight;
        const isUp = c.close >= c.open;

        // Requirement 3: Highlight volume bar when volume is higher than previous candle's volume
        const prevCandle = gIdx > 0 ? candles[gIdx - 1] : null;
        const isHigherVol = prevCandle ? c.volume > prevCandle.volume : false;

        if (isHigherVol) {
          ctx.fillStyle = isUp ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)';
          ctx.fillRect(x, chartHeight - vHeight, candleWidth, vHeight);
          ctx.strokeStyle = isUp ? '#10b981' : '#ef4444';
          ctx.lineWidth = 1 * dpr;
          ctx.strokeRect(x, chartHeight - vHeight, candleWidth, vHeight);
        } else {
          ctx.fillStyle = isUp ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
          ctx.fillRect(x, chartHeight - vHeight, candleWidth, vHeight);
        }
      }
    }

    // Bollinger Bands Cloud
    if (indicators.showBollinger && indicatorData?.bb) {
      const { upper, middle, lower } = indicatorData.bb;
      
      // Fill band area
      ctx.beginPath();
      let first = true;
      for (let gIdx = startIdx; gIdx < endIdx; gIdx++) {
        const u = upper[gIdx];
        if (u !== null && u !== undefined) {
          const slot = gIdx - startGlobalIdx;
          const x = slot * slotWidth + slotWidth / 2;
          const y = priceToY(u);
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      for (let gIdx = endIdx - 1; gIdx >= startIdx; gIdx--) {
        const l = lower[gIdx];
        if (l !== null && l !== undefined) {
          const slot = gIdx - startGlobalIdx;
          const x = slot * slotWidth + slotWidth / 2;
          const y = priceToY(l);
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(168, 85, 247, 0.06)';
      ctx.fill();

      // Stroke upper and lower lines
      const drawBandLine = (arr: (number | null)[], color: string) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1 * dpr;
        let started = false;
        for (let gIdx = startIdx; gIdx < endIdx; gIdx++) {
          const val = arr[gIdx];
          if (val !== null && val !== undefined) {
            const slot = gIdx - startGlobalIdx;
            const x = slot * slotWidth + slotWidth / 2;
            const y = priceToY(val);
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
        ctx.stroke();
      };

      drawBandLine(upper, 'rgba(168, 85, 247, 0.6)');
      drawBandLine(middle, 'rgba(168, 85, 247, 0.35)');
      drawBandLine(lower, 'rgba(168, 85, 247, 0.6)');
    }

    // EMA 20, 50, 100, 200 Lines
    const drawIndicatorLine = (series: (number | null)[] | null, color: string, lineWidth: number = 1.5) => {
      if (!series) return;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth * dpr;
      let started = false;

      for (let gIdx = startIdx; gIdx < endIdx; gIdx++) {
        const val = series[gIdx];
        if (val !== null && val !== undefined) {
          const slot = gIdx - startGlobalIdx;
          const x = slot * slotWidth + slotWidth / 2;
          const y = priceToY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();
    };

    drawIndicatorLine(indicatorData?.ema20 ?? null, '#06b6d4', 1.8); // EMA 20 Cyan
    drawIndicatorLine(indicatorData?.ema50 ?? null, '#f59e0b', 1.8); // EMA 50 Amber
    drawIndicatorLine(indicatorData?.ema100 ?? null, '#818cf8', 1.8); // EMA 100 Indigo
    drawIndicatorLine(indicatorData?.ema200 ?? null, '#f43f5e', 2.0); // EMA 200 Rose

    // Draw Main Price Series: Candles or Line
    if (chartType === 'candles') {
      for (let gIdx = startIdx; gIdx < endIdx; gIdx++) {
        const c = candles[gIdx];
        const slot = gIdx - startGlobalIdx;
        const x = slot * slotWidth + (slotWidth - candleWidth) / 2;
        const centerX = slot * slotWidth + slotWidth / 2;
        const isUp = c.close >= c.open;
        const candleColor = isUp ? '#10b981' : '#ef4444';

        // Draw Wick
        ctx.strokeStyle = candleColor;
        ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath();
        ctx.moveTo(centerX, priceToY(c.high));
        ctx.lineTo(centerX, priceToY(c.low));
        ctx.stroke();

        // Draw Candle Body
        const openY = priceToY(c.open);
        const closeY = priceToY(c.close);
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(2 * dpr, Math.abs(openY - closeY));

        ctx.fillStyle = candleColor;
        ctx.fillRect(x, bodyTop, candleWidth, bodyHeight);

        // Requirement 4: Bullish engulfing detector
        if (showBullishEngulfing && gIdx > 0) {
          const prev = candles[gIdx - 1];
          const isPrevRed = prev.close < prev.open;
          const isCurrGreen = c.close > c.open;
          const isEngulfingBody = isPrevRed && isCurrGreen && c.close > prev.open && c.open <= (prev.close + Math.abs(prev.open - prev.close) * 0.2);

          if (isEngulfingBody) {
            const isConfirmed = c.close > prev.high && c.volume > prev.volume;
            const badgeY = priceToY(c.low) + 6 * dpr;

            ctx.save();
            ctx.font = `bold ${8.5 * dpr}px 'Plus Jakarta Sans', sans-serif`;
            const text = isConfirmed ? 'Buyer จริง' : 'อาจเป็น short covering';
            const textWidth = ctx.measureText(text).width;
            const badgeW = textWidth + 8 * dpr;
            const badgeH = 14 * dpr;
            const badgeX = centerX - badgeW / 2;

            ctx.fillStyle = isConfirmed ? 'rgba(16, 185, 129, 0.95)' : 'rgba(245, 158, 11, 0.95)';
            if (ctx.roundRect) {
              ctx.beginPath();
              ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3 * dpr);
              ctx.fill();
            } else {
              ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
            }

            ctx.fillStyle = isConfirmed ? '#022c22' : '#451a03';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, centerX, badgeY + badgeH / 2);
            ctx.restore();
          }
        }
      }
    } else {
      // Area / Line Chart mode
      ctx.beginPath();
      let firstX = 0;
      let lastX = 0;
      for (let gIdx = startIdx; gIdx < endIdx; gIdx++) {
        const c = candles[gIdx];
        const slot = gIdx - startGlobalIdx;
        const x = slot * slotWidth + slotWidth / 2;
        const y = priceToY(c.close);
        if (gIdx === startIdx) {
          firstX = x;
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        lastX = x;
      }

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();

      ctx.lineTo(lastX, chartHeight);
      ctx.lineTo(firstX, chartHeight);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
      gradient.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
      gradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Live Current Price Horizontal Line & Tag
    const currentPriceY = priceToY(currentPrice);
    if (currentPriceY >= 0 && currentPriceY <= chartHeight) {
      ctx.beginPath();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.2 * dpr;
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.moveTo(0, currentPriceY);
      ctx.lineTo(chartWidth, currentPriceY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Current Price badge on right axis
      ctx.fillStyle = '#0284c7';
      const badgeHeight = 18 * dpr;
      const badgeY = currentPriceY - badgeHeight / 2;
      ctx.fillRect(chartWidth + 2 * dpr, badgeY, rightPadding - 4 * dpr, badgeHeight);

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${10 * dpr}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(currentPrice.toFixed(decimals), chartWidth + (rightPadding - 4 * dpr) / 2 + 2 * dpr, currentPriceY);
    }

    // Requirement 5: Support & Resistance horizontal level line
    if (srLevel !== null) {
      const srY = priceToY(srLevel);
      if (srY >= 0 && srY <= chartHeight) {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.8 * dpr;
        ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.moveTo(0, srY);
        ctx.lineTo(chartWidth, srY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Tag on right axis
        const tagHeight = 18 * dpr;
        ctx.fillStyle = '#06b6d4';
        ctx.fillRect(chartWidth + 2 * dpr, srY - tagHeight / 2, rightPadding - 4 * dpr, tagHeight);
        ctx.fillStyle = '#083344';
        ctx.font = `bold ${9 * dpr}px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`S/R ${srLevel.toFixed(decimals)}`, chartWidth + (rightPadding - 4 * dpr) / 2 + 2 * dpr, srY);
        ctx.restore();
      }
    }

    // ACTIVE PRICE ALERTS VISUAL LINES ON CHART!
    symbolAlerts.forEach(alert => {
      const alertY = priceToY(alert.targetPrice);
      if (alertY >= 0 && alertY <= chartHeight) {
        const isAbove = alert.targetPrice >= currentPrice;
        const alertColor = isAbove ? '#f59e0b' : '#6366f1'; // Amber for upper target, Indigo for lower

        ctx.beginPath();
        ctx.strokeStyle = alertColor;
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.moveTo(0, alertY);
        ctx.lineTo(chartWidth, alertY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Alert Tag Box on Right Axis
        const tagHeight = 18 * dpr;
        const tagY = alertY - tagHeight / 2;
        ctx.fillStyle = alertColor;
        ctx.fillRect(chartWidth + 2 * dpr, tagY, rightPadding - 4 * dpr, tagHeight);

        // Bell icon indicator / label
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${9.5 * dpr}px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`🔔 ${alert.targetPrice.toFixed(decimals)}`, chartWidth + (rightPadding - 4 * dpr) / 2 + 2 * dpr, alertY);

        // Small note label on chart line
        if (alert.note) {
          ctx.fillStyle = alertColor;
          ctx.font = `${10 * dpr}px 'Plus Jakarta Sans', sans-serif`;
          ctx.textAlign = 'left';
          ctx.fillText(`⚡ ${alert.note}`, 12 * dpr, alertY - 6 * dpr);
        }
      }
    });

    // Helper to calculate (x, y) for trendline points anchored to time & price
    const getPointCoords = (pt: { time: number; price: number }) => {
      let cIdx = -1;
      for (let i = 0; i < candles.length; i++) {
        if (candles[i].time === pt.time) {
          cIdx = i;
          break;
        }
      }
      if (cIdx === -1 && candles.length > 0) {
        const firstT = candles[0].time;
        const lastT = candles[candles.length - 1].time;
        const intervalSec = TIMEFRAME_SECONDS[timeframe] || 86400;
        if (pt.time < firstT) {
          cIdx = Math.round((pt.time - firstT) / intervalSec);
        } else if (pt.time > lastT) {
          cIdx = candles.length - 1 + Math.round((pt.time - lastT) / intervalSec);
        } else {
          let nearest = 0;
          let minD = Infinity;
          for (let i = 0; i < candles.length; i++) {
            const diff = Math.abs(candles[i].time - pt.time);
            if (diff < minD) {
              minD = diff;
              nearest = i;
            }
          }
          cIdx = nearest;
        }
      }
      const slot = cIdx - startGlobalIdx;
      const x = slot * slotWidth + slotWidth / 2;
      const y = priceToY(pt.price);
      return { x, y };
    };

    // Render Saved Trendlines (TradingView style)
    trendlines.forEach(tl => {
      const p1 = getPointCoords(tl.p1);
      const p2 = getPointCoords(tl.p2);
      const isSelected = selectedTrendlineId === tl.id;

      ctx.save();
      ctx.strokeStyle = isSelected ? '#38bdf8' : (tl.color || '#06b6d4');
      ctx.lineWidth = (isSelected ? 2.5 : 2) * dpr;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Anchors
      const drawAnchor = (x: number, y: number) => {
        ctx.beginPath();
        ctx.fillStyle = isSelected ? '#38bdf8' : '#06b6d4';
        ctx.arc(x, y, 4 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2 * dpr;
        ctx.stroke();
      };
      drawAnchor(p1.x, p1.y);
      drawAnchor(p2.x, p2.y);
      ctx.restore();
    });

    // In-progress Trendline drawing preview line
    if (isDrawingTrendline && trendlineStart && mousePriceHover) {
      const p1 = getPointCoords(trendlineStart);
      const p2 = getPointCoords(mousePriceHover);

      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.8 * dpr;
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Point 1 Anchor
      ctx.beginPath();
      ctx.fillStyle = '#0284c7';
      ctx.arc(p1.x, p1.y, 4.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2 * dpr;
      ctx.stroke();

      // Point 2 Anchor
      ctx.beginPath();
      ctx.fillStyle = '#f59e0b';
      ctx.arc(p2.x, p2.y, 4.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // TradingView-style Crosshair rendering
    if (crosshair && crosshair.slotIndex >= 0 && crosshair.slotIndex < visibleCount) {
      const candleCenterX = crosshair.slotIndex * slotWidth + slotWidth / 2;
      const candle = crosshair.candle;

      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([4 * dpr, 3 * dpr]);

      // Vertical line through price chart all the way to bottom of canvas
      ctx.beginPath();
      ctx.moveTo(candleCenterX, 0);
      ctx.lineTo(candleCenterX, chartHeight);
      ctx.stroke();

      // Horizontal line & Price badge on Right Axis (when cursor is on main chart)
      if (crosshair.source === 'main' && crosshair.y >= 0 && crosshair.y <= chartHeight) {
        ctx.beginPath();
        ctx.moveTo(0, crosshair.y);
        ctx.lineTo(chartWidth, crosshair.y);
        ctx.stroke();

        ctx.setLineDash([]);
        const hoverPrice = yToPrice(crosshair.y);
        const cTagHeight = 18 * dpr;
        const cTagWidth = rightPadding - 4 * dpr;
        const cTagX = chartWidth + 2 * dpr;
        const cTagY = crosshair.y - cTagHeight / 2;

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(cTagX, cTagY, cTagWidth, cTagHeight);
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1 * dpr;
        ctx.strokeRect(cTagX, cTagY, cTagWidth, cTagHeight);

        ctx.fillStyle = '#f8fafc';
        ctx.font = `bold ${10 * dpr}px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hoverPrice.toFixed(decimals), cTagX + cTagWidth / 2, crosshair.y);
      }

      // Date & Time badge pill on bottom X-axis
      let dateForPill: Date | null = null;
      if (candle) {
        dateForPill = new Date(candle.time * 1000);
      } else if (candles.length > 0) {
        const gIdx = startGlobalIdx + crosshair.slotIndex;
        if (gIdx >= candles.length) {
          const lastCandle = candles[candles.length - 1];
          const diffBars = gIdx - (candles.length - 1);
          const intervalSec = TIMEFRAME_SECONDS[timeframe] || 86400;
          dateForPill = new Date((lastCandle.time + diffBars * intervalSec) * 1000);
        }
      }

      if (dateForPill) {
        ctx.setLineDash([]);
        const d = dateForPill;
        const isDailyOrWeekly = timeframe === '1d' || timeframe === '1w' || isWeeklyView;

        let dateStr: string;
        if (isDailyOrWeekly) {
          const year = d.getFullYear();
          const month = (d.getMonth() + 1).toString().padStart(2, '0');
          const day = d.getDate().toString().padStart(2, '0');
          const daysOfWeek = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
          dateStr = `${day}/${month}/${year} (${daysOfWeek[d.getDay()]})`;
        } else {
          const month = (d.getMonth() + 1).toString().padStart(2, '0');
          const day = d.getDate().toString().padStart(2, '0');
          const hours = d.getHours().toString().padStart(2, '0');
          const minutes = d.getMinutes().toString().padStart(2, '0');
          dateStr = `${day}/${month} ${hours}:${minutes}`;
        }

        ctx.font = `bold ${9.5 * dpr}px 'JetBrains Mono', monospace`;
        const textWidth = ctx.measureText(dateStr).width;
        const dateTagWidth = textWidth + 12 * dpr;
        const dateTagHeight = 18 * dpr;
        const dateTagX = Math.max(2 * dpr, Math.min(chartWidth - dateTagWidth - 2 * dpr, candleCenterX - dateTagWidth / 2));
        const dateTagY = chartHeight + 3 * dpr;

        ctx.fillStyle = candle ? '#0284c7' : '#0369a1';
        ctx.fillRect(dateTagX, dateTagY, dateTagWidth, dateTagHeight);
        ctx.strokeStyle = candle ? '#38bdf8' : '#7dd3fc';
        ctx.lineWidth = 1 * dpr;
        ctx.strokeRect(dateTagX, dateTagY, dateTagWidth, dateTagHeight);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dateStr, dateTagX + dateTagWidth / 2, dateTagY + dateTagHeight / 2);
      }

      ctx.restore();
    }

  }, [
    visibleCandles, 
    chartType, 
    indicators, 
    indicatorData, 
    currentPrice, 
    symbolAlerts, 
    crosshair, 
    decimals, 
    timeframe, 
    panOffset, 
    visibleCount, 
    candles.length,
    showBullishEngulfing,
    srLevel,
    isWeeklyView,
    trendlines,
    isDrawingTrendline,
    trendlineStart,
    mousePriceHover,
    selectedTrendlineId,
    getPriceRange,
    isHoveringYAxis,
    isDraggingYAxis
  ]);

  // Sub-Indicator Canvas (RSI or MACD)
  const drawSubChart = useCallback(() => {
    const canvas = subCanvasRef.current;
    if (!canvas || (!indicators.showRSI && !indicators.showMACD)) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, width, height);
    if (visibleCandles.length === 0) return;

    const rightPadding = 75 * dpr;
    const chartWidth = width - rightPadding;
    const slotWidth = chartWidth / visibleCount;
    const startGlobalIdx = candles.length - panOffset - visibleCount;
    const startIdx = Math.max(0, startGlobalIdx);
    const endIdx = Math.min(candles.length, startGlobalIdx + visibleCount);

    const showRSI = indicators.showRSI && !!indicatorData?.rsi;
    const showMACD = indicators.showMACD && !!indicatorData?.macd;
    const bothActive = showRSI && showMACD;

    const rsiPaneTop = 0;
    const rsiPaneHeight = bothActive ? height / 2 : height;

    const macdPaneTop = bothActive ? height / 2 : 0;
    const macdPaneHeight = bothActive ? height / 2 : height;

    // Divider line between panes if both active
    if (bothActive) {
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(chartWidth + rightPadding, height / 2);
      ctx.stroke();
    }

    if (showRSI && indicatorData?.rsi) {
      // Draw RSI (0 - 100)
      const rsiSeries = indicatorData.rsi;
      const rsiToY = (val: number) => rsiPaneTop + rsiPaneHeight - (val / 100) * rsiPaneHeight;

      // 30 & 70 threshold lines
      ctx.lineWidth = 1 * dpr;
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; // 70 Overbought
      ctx.setLineDash([3 * dpr, 3 * dpr]);
      ctx.beginPath();
      ctx.moveTo(0, rsiToY(70));
      ctx.lineTo(chartWidth, rsiToY(70));
      ctx.stroke();

      ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)'; // 30 Oversold
      ctx.beginPath();
      ctx.moveTo(0, rsiToY(30));
      ctx.lineTo(chartWidth, rsiToY(30));
      ctx.stroke();
      ctx.setLineDash([]);

      // Shaded zone 30-70
      ctx.fillStyle = 'rgba(100, 116, 139, 0.06)';
      ctx.fillRect(0, rsiToY(70), chartWidth, rsiToY(30) - rsiToY(70));

      // Right axis labels
      ctx.fillStyle = '#64748b';
      ctx.font = `${8.5 * dpr}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'left';
      ctx.fillText('70 OB', chartWidth + 6 * dpr, rsiToY(70) + 3 * dpr);
      ctx.fillText('30 OS', chartWidth + 6 * dpr, rsiToY(30) + 3 * dpr);

      // Plot RSI line
      ctx.beginPath();
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 1.8 * dpr;
      let started = false;
      let lastVal: number | null = null;

      for (let gIdx = startIdx; gIdx < endIdx; gIdx++) {
        const val = rsiSeries[gIdx];
        if (val !== null && val !== undefined) {
          lastVal = val;
          const slot = gIdx - startGlobalIdx;
          const x = slot * slotWidth + slotWidth / 2;
          const y = rsiToY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();

      // Current or Hovered RSI value for header label
      const hoveredSlot = crosshair?.slotIndex !== undefined ? crosshair.slotIndex : -1;
      const hoveredGIdx = hoveredSlot >= 0 ? startGlobalIdx + hoveredSlot : -1;
      const hoveredRsiVal = (hoveredGIdx >= 0 && hoveredGIdx < rsiSeries.length) ? rsiSeries[hoveredGIdx] : null;
      const activeRsiVal = hoveredRsiVal !== null && hoveredRsiVal !== undefined ? hoveredRsiVal : lastVal;

      let rsiStatus = '';
      if (activeRsiVal !== null && activeRsiVal !== undefined) {
        if (activeRsiVal >= 70) rsiStatus = ' • Overbought (ซื้อมากเกินไป)';
        else if (activeRsiVal <= 30) rsiStatus = ' • Oversold (ขายมากเกินไป)';
      }

      ctx.fillStyle = '#c084fc';
      ctx.font = `bold ${9.5 * dpr}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(
        `RSI (14): ${activeRsiVal !== null && activeRsiVal !== undefined ? activeRsiVal.toFixed(1) : '--'}${rsiStatus}`,
        12 * dpr,
        rsiPaneTop + 14 * dpr
      );

      // RSI tracker dot and horizontal guideline
      if (hoveredRsiVal !== null && hoveredRsiVal !== undefined && crosshair && crosshair.slotIndex >= 0 && crosshair.slotIndex < visibleCount) {
        const candleCenterX = crosshair.slotIndex * slotWidth + slotWidth / 2;
        const rsiY = rsiToY(hoveredRsiVal);

        ctx.save();
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)';
        ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.beginPath();
        ctx.moveTo(0, rsiY);
        ctx.lineTo(chartWidth, rsiY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.fillStyle = 'rgba(168, 85, 247, 0.35)';
        ctx.arc(candleCenterX, rsiY, 5.5 * dpr, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = '#a855f7';
        ctx.arc(candleCenterX, rsiY, 3.2 * dpr, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = '#ffffff';
        ctx.arc(candleCenterX, rsiY, 1.2 * dpr, 0, Math.PI * 2);
        ctx.fill();

        const badgeHeight = 16 * dpr;
        const badgeWidth = rightPadding - 6 * dpr;
        const badgeX = chartWidth + 3 * dpr;
        const badgeY = Math.max(rsiPaneTop + 2 * dpr, Math.min(rsiPaneTop + rsiPaneHeight - badgeHeight - 2 * dpr, rsiY - badgeHeight / 2));

        ctx.fillStyle = '#7e22ce';
        ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 1 * dpr;
        ctx.strokeRect(badgeX, badgeY, badgeWidth, badgeHeight);

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${9 * dpr}px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`RSI ${hoveredRsiVal.toFixed(1)}`, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);
        ctx.restore();
      }
    }

    if (showMACD && indicatorData?.macd) {
      // MACD Sub-Pane
      const { macdLine, signalLine, histogram } = indicatorData.macd;
      let maxAbs = 1;
      for (let gIdx = startIdx; gIdx < endIdx; gIdx++) {
        if (macdLine[gIdx]) maxAbs = Math.max(maxAbs, Math.abs(macdLine[gIdx]!));
        if (signalLine[gIdx]) maxAbs = Math.max(maxAbs, Math.abs(signalLine[gIdx]!));
        if (histogram[gIdx]) maxAbs = Math.max(maxAbs, Math.abs(histogram[gIdx]!));
      }
      maxAbs *= 1.2;

      const macdZeroY = macdPaneTop + macdPaneHeight / 2;
      const macdToY = (val: number) => macdZeroY - (val / maxAbs) * (macdPaneHeight / 2 * 0.85);

      // Zero line
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, macdZeroY);
      ctx.lineTo(chartWidth, macdZeroY);
      ctx.stroke();

      // Histogram bars
      const barW = Math.max(2 * dpr, slotWidth * 0.6);
      for (let gIdx = startIdx; gIdx < endIdx; gIdx++) {
        const hist = histogram[gIdx];
        if (hist !== null && hist !== undefined) {
          const slot = gIdx - startGlobalIdx;
          const x = slot * slotWidth + (slotWidth - barW) / 2;
          const y = macdToY(hist);
          ctx.fillStyle = hist >= 0 ? '#10b981' : '#ef4444';
          ctx.fillRect(x, Math.min(y, macdZeroY), barW, Math.abs(y - macdZeroY));
        }
      }

      // MACD Line
      ctx.beginPath();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5 * dpr;
      let started = false;
      for (let gIdx = startIdx; gIdx < endIdx; gIdx++) {
        const val = macdLine[gIdx];
        if (val !== null && val !== undefined) {
          const slot = gIdx - startGlobalIdx;
          const x = slot * slotWidth + slotWidth / 2;
          const y = macdToY(val);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else { ctx.lineTo(x, y); }
        }
      }
      ctx.stroke();

      // Signal Line
      ctx.beginPath();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5 * dpr;
      started = false;
      for (let gIdx = startIdx; gIdx < endIdx; gIdx++) {
        const val = signalLine[gIdx];
        if (val !== null && val !== undefined) {
          const slot = gIdx - startGlobalIdx;
          const x = slot * slotWidth + slotWidth / 2;
          const y = macdToY(val);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else { ctx.lineTo(x, y); }
        }
      }
      ctx.stroke();

      // MACD Title with live or hovered values
      const hoveredSlot = crosshair?.slotIndex !== undefined ? crosshair.slotIndex : -1;
      const hoveredGIdx = hoveredSlot >= 0 ? startGlobalIdx + hoveredSlot : -1;
      const hMacd = (hoveredGIdx >= 0 && hoveredGIdx < macdLine.length) ? macdLine[hoveredGIdx] : null;
      const hSig = (hoveredGIdx >= 0 && hoveredGIdx < signalLine.length) ? signalLine[hoveredGIdx] : null;
      const hHist = (hoveredGIdx >= 0 && hoveredGIdx < histogram.length) ? histogram[hoveredGIdx] : null;

      ctx.font = `bold ${9.5 * dpr}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'left';
      if (hMacd !== null && hMacd !== undefined && hSig !== null && hSig !== undefined) {
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`MACD: ${hMacd.toFixed(2)}`, 12 * dpr, macdPaneTop + 14 * dpr);
        ctx.fillStyle = '#f59e0b';
        ctx.fillText(`Signal: ${hSig.toFixed(2)}`, 105 * dpr, macdPaneTop + 14 * dpr);
        if (hHist !== null && hHist !== undefined) {
          ctx.fillStyle = hHist >= 0 ? '#10b981' : '#ef4444';
          ctx.fillText(`Hist: ${hHist >= 0 ? '+' : ''}${hHist.toFixed(2)}`, 195 * dpr, macdPaneTop + 14 * dpr);
        }
      } else {
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('MACD (12, 26, 9)', 12 * dpr, macdPaneTop + 14 * dpr);
      }

      // MACD tracker dots
      if (crosshair && crosshair.slotIndex >= 0 && crosshair.slotIndex < visibleCount) {
        const candleCenterX = crosshair.slotIndex * slotWidth + slotWidth / 2;
        ctx.save();
        if (hMacd !== null && hMacd !== undefined) {
          const mY = macdToY(hMacd);
          ctx.beginPath();
          ctx.fillStyle = '#38bdf8';
          ctx.arc(candleCenterX, mY, 3 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
        if (hSig !== null && hSig !== undefined) {
          const sY = macdToY(hSig);
          ctx.beginPath();
          ctx.fillStyle = '#f59e0b';
          ctx.arc(candleCenterX, sY, 3 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // Continuous vertical dashed line across the whole sub-chart
    if (crosshair && crosshair.slotIndex >= 0 && crosshair.slotIndex < visibleCount) {
      const candleCenterX = crosshair.slotIndex * slotWidth + slotWidth / 2;
      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.beginPath();
      ctx.moveTo(candleCenterX, 0);
      ctx.lineTo(candleCenterX, height);
      ctx.stroke();
      ctx.restore();
    }
  }, [
    visibleCandles, 
    indicators, 
    indicatorData, 
    panOffset, 
    visibleCount, 
    candles.length,
    crosshair
  ]);

  // Synchronize high-DPI canvas dimensions
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const mainCanvas = mainCanvasRef.current;
      const subCanvas = subCanvasRef.current;
      if (!container || !mainCanvas) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const bothSubCharts = indicators.showRSI && indicators.showMACD;
      const hasSubChart = indicators.showRSI || indicators.showMACD;
      const subHeight = bothSubCharts ? 220 : hasSubChart ? 120 : 0;
      const mainHeight = Math.max(260, rect.height - subHeight - 48);

      mainCanvas.width = rect.width * dpr;
      mainCanvas.height = mainHeight * dpr;
      mainCanvas.style.width = `${rect.width}px`;
      mainCanvas.style.height = `${mainHeight}px`;

      if (subCanvas && hasSubChart) {
        subCanvas.width = rect.width * dpr;
        subCanvas.height = subHeight * dpr;
        subCanvas.style.width = `${rect.width}px`;
        subCanvas.style.height = `${subHeight}px`;
      }

      drawMainChart();
      if (hasSubChart) drawSubChart();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [indicators.showRSI, indicators.showMACD, drawMainChart, drawSubChart]);

  // Trigger redraw on state updates
  useEffect(() => {
    drawMainChart();
    drawSubChart();
  }, [drawMainChart, drawSubChart]);

  // Mouse & Touch interaction handlers for chart panning & crosshair
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const mouseX = (e.clientX - rect.left) * dpr;
    const mouseY = (e.clientY - rect.top) * dpr;

    // Handle Pan Dragging (Free 2D Pan: Horizontal Time & Vertical Price)
    if (isDragging) {
      const deltaX = e.clientX - dragStartX;
      const deltaY = e.clientY - dragStartY;
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        hasDraggedRef.current = true;
      }
      const rightPadding = 75;
      const chartWidth = Math.max(100, rect.width - rightPadding);
      const slotWidth = chartWidth / visibleCount;
      const candleDelta = Math.round(deltaX / slotWidth);
      const maxPan = Math.max(0, candles.length - 5);
      const minPan = -Math.floor(visibleCount * 0.85);
      const newOffset = Math.max(minPan, Math.min(maxPan, dragStartPan + candleDelta));
      setPanOffset(newOffset);

      // Vertical price pan (shifts chart up and down freely)
      const chartHeight = Math.max(100, rect.height - 25);
      const { paddedRange } = getPriceRange(visibleCandles);
      const priceDelta = (deltaY / chartHeight) * paddedRange;
      setPricePanOffset(dragStartPricePan + priceDelta);
      return;
    }

    // Determine hover slot & candle
    const rightPadding = 75 * dpr;
    const chartWidth = canvas.width - rightPadding;
    const isOverY = mouseX >= chartWidth;
    setIsHoveringYAxis(isOverY);

    const slotWidth = chartWidth / visibleCount;
    const slotIdx = Math.max(0, Math.min(visibleCount - 1, Math.floor(mouseX / slotWidth)));
    const startGlobalIdx = candles.length - panOffset - visibleCount;
    const gIdx = startGlobalIdx + slotIdx;
    const candle = (gIdx >= 0 && gIdx < candles.length) ? candles[gIdx] : null;

    if (isDrawingTrendline) {
      const { minPrice, paddedRange } = getPriceRange(visibleCandles);
      const chartHeight = canvas.height - 25 * dpr;
      const hoverPrice = minPrice + (1 - mouseY / chartHeight) * paddedRange;

      let hoverTime = 0;
      if (gIdx >= 0 && gIdx < candles.length) {
        hoverTime = candles[gIdx].time;
      } else if (candles.length > 0) {
        const lastCandle = candles[candles.length - 1];
        const diffBars = gIdx - (candles.length - 1);
        const intervalSec = TIMEFRAME_SECONDS[timeframe] || 86400;
        hoverTime = lastCandle.time + diffBars * intervalSec;
      }
      setMousePriceHover({ time: hoverTime, price: Number(hoverPrice.toFixed(decimals)) });
    }

    setCrosshair({
      x: mouseX,
      y: mouseY,
      candle,
      slotIndex: slotIdx,
      source: 'main',
    });
  };

  const handleSubMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = subCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const mouseX = (e.clientX - rect.left) * dpr;
    const mouseY = (e.clientY - rect.top) * dpr;

    // Handle Pan Dragging on Sub Chart
    if (isDragging) {
      const deltaX = e.clientX - dragStartX;
      if (Math.abs(deltaX) > 2) {
        hasDraggedRef.current = true;
      }
      const rightPadding = 75;
      const chartWidth = Math.max(100, rect.width - rightPadding);
      const slotWidth = chartWidth / visibleCount;
      const candleDelta = Math.round(deltaX / slotWidth);
      const maxPan = Math.max(0, candles.length - 5);
      const minPan = -Math.floor(visibleCount * 0.85);
      const newOffset = Math.max(minPan, Math.min(maxPan, dragStartPan + candleDelta));
      setPanOffset(newOffset);
      return;
    }

    const rightPadding = 75 * dpr;
    const chartWidth = canvas.width - rightPadding;
    if (chartWidth <= 0) return;

    const slotWidth = chartWidth / visibleCount;
    const slotIdx = Math.max(0, Math.min(visibleCount - 1, Math.floor(mouseX / slotWidth)));
    const startGlobalIdx = candles.length - panOffset - visibleCount;
    const gIdx = startGlobalIdx + slotIdx;
    const candle = (gIdx >= 0 && gIdx < candles.length) ? candles[gIdx] : null;

    setCrosshair({
      x: mouseX,
      y: mouseY,
      candle,
      slotIndex: slotIdx,
      source: 'sub',
    });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const mouseX = (e.clientX - rect.left) * dpr;
    const rightPadding = 75 * dpr;
    const chartWidth = canvas.width - rightPadding;

    if (mouseX >= chartWidth) {
      // User clicked on price axis to stretch or compress Y axis
      setIsDraggingYAxis(true);
      isDraggingYAxisRef.current = true;
      dragStartYRef.current = e.clientY;
      dragStartScaleRef.current = priceScaleMultiplier;
      dragStartPanOffsetRef.current = pricePanOffset;
      hasDraggedRef.current = true;
      return;
    }

    if (isDrawingSr || isDrawingTrendline) return; // In drawing mode
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartY(e.clientY);
    setDragStartPan(panOffset);
    setDragStartPricePan(pricePanOffset);
    hasDraggedRef.current = false;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsDraggingYAxis(false);
    isDraggingYAxisRef.current = false;
  };

  const handleMouseLeave = () => {
    if (!isDragging && !isDraggingYAxisRef.current) {
      setIsHoveringYAxis(false);
      setCrosshair(null);
    }
  };

  const handleDoubleClick = () => {
    // Double click anywhere on chart or price scale: Reset Y scale & pan offset back to Auto-fit
    setPriceScaleMultiplier(1.0);
    setPricePanOffset(0);
  };

  // Touch support for smooth mobile dragging & Y-axis scaling
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const canvas = mainCanvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        if (touch.clientX >= rect.right - 75) {
          setIsDraggingYAxis(true);
          isDraggingYAxisRef.current = true;
          dragStartYRef.current = touch.clientY;
          dragStartScaleRef.current = priceScaleMultiplier;
          hasDraggedRef.current = true;
          return;
        }
      }
      if (!isDrawingSr && !isDrawingTrendline) {
        touchStartXRef.current = touch.clientX;
        touchStartYRef.current = touch.clientY;
        touchStartPanRef.current = panOffset;
        touchStartPricePanRef.current = pricePanOffset;
        setIsDragging(true);
        hasDraggedRef.current = false;
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isDraggingYAxis && e.touches.length === 1) {
      const deltaY = e.touches[0].clientY - dragStartYRef.current;
      const newScale = Math.max(0.15, Math.min(40, dragStartScaleRef.current * Math.exp(-deltaY * 0.007)));
      setPriceScaleMultiplier(newScale);
      return;
    }
    if (e.touches.length === 1 && isDragging) {
      const deltaX = e.touches[0].clientX - touchStartXRef.current;
      const deltaY = e.touches[0].clientY - touchStartYRef.current;
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        hasDraggedRef.current = true;
      }
      const canvas = mainCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const rightPadding = 75;
      const chartWidth = Math.max(100, rect.width - rightPadding);
      const slotWidth = chartWidth / visibleCount;
      const candleDelta = Math.round(deltaX / slotWidth);
      const maxPan = Math.max(0, candles.length - 5);
      const minPan = -Math.floor(visibleCount * 0.85);
      const newOffset = Math.max(minPan, Math.min(maxPan, touchStartPanRef.current + candleDelta));
      setPanOffset(newOffset);

      // Free vertical drag on touch
      const chartHeight = Math.max(100, rect.height - 25);
      const { paddedRange } = getPriceRange(visibleCandles);
      const priceDelta = (deltaY / chartHeight) * paddedRange;
      setPricePanOffset(touchStartPricePanRef.current + priceDelta);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setIsDraggingYAxis(false);
    isDraggingYAxisRef.current = false;
  };

  // Wheel zoom (over price axis or with Ctrl: vertical Y-zoom, with Alt: vertical pan, over chart: horizontal bar zoom)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = mainCanvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const rightPadding = 75;
      if (e.clientX >= rect.right - rightPadding) {
        const factor = e.deltaY < 0 ? 1.15 : 0.85;
        setPriceScaleMultiplier(prev => Math.max(0.15, Math.min(40, prev * factor)));
        return;
      }
    }
    if (e.ctrlKey) {
      const factor = e.deltaY < 0 ? 1.15 : 0.85;
      setPriceScaleMultiplier(prev => Math.max(0.15, Math.min(40, prev * factor)));
      return;
    }
    if (e.altKey) {
      const { paddedRange } = getPriceRange(visibleCandles);
      const priceDelta = (e.deltaY < 0 ? -0.05 : 0.05) * paddedRange;
      setPricePanOffset(prev => prev + priceDelta);
      return;
    }
    if (e.deltaY < 0) {
      handleZoom(-5);
    } else {
      handleZoom(5);
    }
  };

  // Canvas click: used for Trendline & S/R line placement
  const handleChartClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }

    if (isDrawingTrendline) {
      const canvas = mainCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const clickX = (e.clientX - rect.left) * dpr;
      const clickY = (e.clientY - rect.top) * dpr;
      const rightPadding = 75 * dpr;
      const chartWidth = canvas.width - rightPadding;
      const slotWidth = chartWidth / visibleCount;
      const slot = Math.max(0, Math.min(visibleCount - 1, Math.floor(clickX / slotWidth)));
      const startGlobalIdx = candles.length - panOffset - visibleCount;
      const gIdx = startGlobalIdx + slot;

      let clickTime = 0;
      if (gIdx >= 0 && gIdx < candles.length) {
        clickTime = candles[gIdx].time;
      } else if (candles.length > 0) {
        const lastCandle = candles[candles.length - 1];
        const diffBars = gIdx - (candles.length - 1);
        const intervalSec = TIMEFRAME_SECONDS[timeframe] || 86400;
        clickTime = lastCandle.time + diffBars * intervalSec;
      }

      const { minPrice, paddedRange } = getPriceRange(visibleCandles);
      const chartHeight = canvas.height - 25 * dpr;
      const clickedPrice = minPrice + (1 - clickY / chartHeight) * paddedRange;

      if (!trendlineStart) {
        setTrendlineStart({ time: clickTime, price: Number(clickedPrice.toFixed(decimals)) });
      } else {
        const newTl: TrendLine = {
          id: `tl_${Date.now()}`,
          p1: trendlineStart,
          p2: { time: clickTime, price: Number(clickedPrice.toFixed(decimals)) },
          color: '#06b6d4',
        };
        setTrendlines(prev => [...prev, newTl]);
        setTrendlineRedoStack([]);
        setTrendlineStart(null);
        setIsDrawingTrendline(false);
        setMousePriceHover(null);
      }
      return;
    }

    if (isDrawingSr) {
      const canvas = mainCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const clickY = (e.clientY - rect.top) * dpr;
      
      const { minPrice, paddedRange } = getPriceRange(visibleCandles);
      const chartHeight = canvas.height - 25 * dpr;

      const clickedPrice = minPrice + (1 - clickY / chartHeight) * paddedRange;
      if (clickedPrice > 0 && clickY <= chartHeight) {
        setSrLevel(Number(clickedPrice.toFixed(decimals)));
        setIsDrawingSr(false);
        setShowSrPanel(true);
      }
    }
  };

  // Requirement 5: Support & Resistance touches analysis
  const srTouches = useMemo(() => {
    if (srLevel === null || visibleCandles.length === 0) return [];
    
    // Find visible candles where low <= srLevel <= high
    const touches: {
      candle: Candle;
      index: number;
      dateStr: string;
      candleSize: number;
      candleSizePct: number;
      volume: number;
      isBullish: boolean;
      volumeTrendVsPrev?: 'up' | 'down' | 'same';
    }[] = [];

    visibleCandles.forEach((c, idx) => {
      if (c.low <= srLevel && c.high >= srLevel) {
        const size = c.high - c.low;
        const sizePct = c.open > 0 ? (size / c.open) * 100 : 0;
        const date = new Date(c.time * 1000);
        const dateStr = timeframe === '1d' || timeframe === '1w' || isWeeklyView
          ? date.toLocaleDateString('th-TH', { month: 'short', day: 'numeric', year: '2-digit' })
          : date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

        touches.push({
          candle: c,
          index: idx + 1,
          dateStr,
          candleSize: size,
          candleSizePct: sizePct,
          volume: c.volume || 0,
          isBullish: c.close >= c.open,
        });
      }
    });

    for (let i = 0; i < touches.length; i++) {
      if (i > 0) {
        const prevVol = touches[i - 1].volume;
        const currVol = touches[i].volume;
        touches[i].volumeTrendVsPrev = currVol > prevVol ? 'up' : currVol < prevVol ? 'down' : 'same';
      }
    }

    return touches;
  }, [srLevel, visibleCandles, timeframe, isWeeklyView]);

  const srVolumeAnalysis = useMemo(() => {
    if (srTouches.length < 2) return null;
    const half = Math.floor(srTouches.length / 2);
    const firstHalf = srTouches.slice(0, half);
    const secondHalf = srTouches.slice(half);
    const avgFirst = firstHalf.reduce((s, t) => s + t.volume, 0) / (firstHalf.length || 1);
    const avgSecond = secondHalf.reduce((s, t) => s + t.volume, 0) / (secondHalf.length || 1);

    const isRising = avgSecond > avgFirst;
    return {
      isRising,
      text: isRising 
        ? 'โวลุ่มเพิ่มขึ้น (แนวรับ/ต้านเริ่มอ่อนแอ — มีโอกาสทะลุสูง)' 
        : 'โวลุ่มลดลง (แนวรับ/ต้านยังคงรับอยู่ — มีแรงป้องกันแนว)',
      summary: isRising ? 'Weakening' : 'Holding',
    };
  }, [srTouches]);

  // Metrics bar values: use crosshair candle if hovering, or latest candle
  const displayCandle = crosshair?.candle || (visibleCandles.length > 0 ? visibleCandles[visibleCandles.length - 1] : null);
  const candleChange = displayCandle ? ((displayCandle.close - displayCandle.open) / displayCandle.open) * 100 : 0;

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden select-none">
      {/* Chart Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-800 bg-slate-950/70 text-xs">
        {/* Timeframe selector (includes 1w) */}
        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800/80">
          {(['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              disabled={isTimeframeDisabled}
              onClick={() => onTimeframeChange(tf)}
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

        {/* Weekly View toggle for CSV daily data */}
        {canToggleWeeklyView && onToggleWeeklyView && (
          <button
            onClick={onToggleWeeklyView}
            className={`px-2.5 py-1 font-mono text-[11px] font-semibold rounded-lg border transition-colors ${
              isWeeklyView
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="รวมแท่งรายวันเป็นแท่งสัปดาห์ (เริ่มวันจันทร์)"
          >
            {isWeeklyView ? '✓ กราฟ 1W (สัปดาห์)' : 'มุมมอง 1W (สัปดาห์)'}
          </button>
        )}

        {/* Chart Type switcher */}
        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800/80">
          <button
            onClick={() => setChartType('candles')}
            className={`px-2 py-1 font-medium rounded-md transition-colors ${
              chartType === 'candles'
                ? 'bg-slate-800 text-cyan-400'
                : 'text-slate-400 hover:text-slate-100'
            }`}
            title="Candlestick (กราฟแท่งเทียน)"
          >
            แท่งเทียน
          </button>
          <button
            onClick={() => setChartType('line')}
            className={`px-2 py-1 font-medium rounded-md transition-colors ${
              chartType === 'line'
                ? 'bg-slate-800 text-cyan-400'
                : 'text-slate-400 hover:text-slate-100'
            }`}
            title="Line (กราฟเส้น)"
          >
            เส้น
          </button>
        </div>

        {/* Indicators Dropdown Button */}
        <div className="relative">
          <button
            onClick={() => setShowIndicatorsMenu(prev => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
              showIndicatorsMenu
                ? 'bg-slate-800 border-cyan-500 text-cyan-300'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="เพิ่ม/ปิดตัวบ่งชี้ทางเทคนิค (Indicators)"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>อินดิเคเตอร์</span>
            <span className="px-1.5 py-0.2 rounded-full bg-cyan-950 border border-cyan-700 text-cyan-300 text-[10px] font-mono font-bold">
              {Object.values(indicators).filter(Boolean).length + (showBullishEngulfing ? 1 : 0)}
            </span>
          </button>

          {/* Indicators Dropdown Popover */}
          {showIndicatorsMenu && (
            <div className="absolute top-full left-0 mt-1.5 w-64 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-3 z-50 text-xs space-y-2.5 backdrop-blur-xl">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  ตัวบ่งชี้ (Indicators)
                </span>
                <button
                  onClick={() => setShowIndicatorsMenu(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Moving Averages */}
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">เส้นค่าเฉลี่ยเคลื่อนที่ (EMA)</div>
                <div className="space-y-1">
                  <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-900 cursor-pointer">
                    <span className="flex items-center gap-2 text-slate-200">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
                      EMA 20
                    </span>
                    <input
                      type="checkbox"
                      checked={indicators.showEMA20}
                      onChange={(e) => setIndicators(prev => ({ ...prev, showEMA20: e.target.checked }))}
                      className="rounded accent-cyan-500 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-900 cursor-pointer">
                    <span className="flex items-center gap-2 text-slate-200">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                      EMA 50
                    </span>
                    <input
                      type="checkbox"
                      checked={indicators.showEMA50}
                      onChange={(e) => setIndicators(prev => ({ ...prev, showEMA50: e.target.checked }))}
                      className="rounded accent-amber-500 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-900 cursor-pointer">
                    <span className="flex items-center gap-2 text-slate-200">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-400"></span>
                      EMA 100
                    </span>
                    <input
                      type="checkbox"
                      checked={indicators.showEMA100}
                      onChange={(e) => setIndicators(prev => ({ ...prev, showEMA100: e.target.checked }))}
                      className="rounded accent-indigo-500 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-900 cursor-pointer">
                    <span className="flex items-center gap-2 text-slate-200">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
                      EMA 200
                    </span>
                    <input
                      type="checkbox"
                      checked={indicators.showEMA200}
                      onChange={(e) => setIndicators(prev => ({ ...prev, showEMA200: e.target.checked }))}
                      className="rounded accent-rose-500 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Bollinger & Volume */}
              <div className="pt-1 border-t border-slate-800/80">
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">ความผันผวน & โวลุ่ม</div>
                <div className="space-y-1">
                  <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-900 cursor-pointer">
                    <span className="flex items-center gap-2 text-slate-200">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-400"></span>
                      Bollinger Bands (20, 2)
                    </span>
                    <input
                      type="checkbox"
                      checked={indicators.showBollinger}
                      onChange={(e) => setIndicators(prev => ({ ...prev, showBollinger: e.target.checked }))}
                      className="rounded accent-purple-500 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-900 cursor-pointer">
                    <span className="flex items-center gap-2 text-slate-200">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                      ปริมาณการซื้อขาย (Volume)
                    </span>
                    <input
                      type="checkbox"
                      checked={indicators.showVolume}
                      onChange={(e) => setIndicators(prev => ({ ...prev, showVolume: e.target.checked }))}
                      className="rounded accent-emerald-500 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-900 cursor-pointer">
                    <span className="flex items-center gap-2 text-slate-200">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      Bullish Engulfing (Buyer จริง)
                    </span>
                    <input
                      type="checkbox"
                      checked={showBullishEngulfing}
                      onChange={(e) => setShowBullishEngulfing(e.target.checked)}
                      className="rounded accent-amber-500 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Sub-Chart Indicators (RSI & MACD simultaneously) */}
              <div className="pt-1 border-t border-slate-800/80">
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">ออสซิลเลเตอร์ด้านล่าง (เปิดพร้อมกันได้)</div>
                <div className="space-y-1">
                  <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-900 cursor-pointer">
                    <span className="flex items-center gap-2 text-slate-200">
                      <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-400"></span>
                      RSI (14)
                    </span>
                    <input
                      type="checkbox"
                      checked={indicators.showRSI}
                      onChange={(e) => setIndicators(prev => ({ ...prev, showRSI: e.target.checked }))}
                      className="rounded accent-fuchsia-500 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-900 cursor-pointer">
                    <span className="flex items-center gap-2 text-slate-200">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
                      MACD (12, 26, 9)
                    </span>
                    <input
                      type="checkbox"
                      checked={indicators.showMACD}
                      onChange={(e) => setIndicators(prev => ({ ...prev, showMACD: e.target.checked }))}
                      className="rounded accent-sky-500 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Trendline & S/R Drawing Tools */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setIsDrawingTrendline(prev => !prev);
              setTrendlineStart(null);
              setIsDrawingSr(false);
            }}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
              isDrawingTrendline
                ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold shadow-sm'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="วาดเส้น Trend line (คลิก 2 จุดบนกราฟ)"
          >
            <span>╱</span>
            <span>Trendline</span>
            {trendlines.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-cyan-950 border border-cyan-700 text-cyan-300 text-[10px] font-mono font-bold">
                {trendlines.length}
              </span>
            )}
          </button>

          {trendlines.length > 0 && (
            <button
              onClick={() => {
                setTrendlines([]);
                setTrendlineRedoStack([]);
                setSelectedTrendlineId(null);
              }}
              className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded border border-slate-800 hover:border-rose-900 transition-colors cursor-pointer"
              title="ลบเส้น Trendline ทั้งหมด"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => {
              setIsDrawingSr(true);
              setIsDrawingTrendline(false);
              setTrendlineStart(null);
            }}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
              isDrawingSr
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="คลิกวางเส้นแนวรับ/ต้าน (S/R)"
          >
            <Compass className="w-3.5 h-3.5 text-amber-400" />
            <span>แนวรับ/ต้าน</span>
          </button>

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5 border-l border-slate-800 pl-1.5 ml-0.5">
            <button
              onClick={handleUndo}
              disabled={trendlines.length === 0 && !trendlineStart && !isDrawingTrendline && !isDrawingSr && srLevel === null}
              className="p-1 text-slate-400 hover:text-white disabled:text-slate-600 hover:bg-slate-800 rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
              title="ย้อนกลับ (Undo - Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={trendlineRedoStack.length === 0}
              className="p-1 text-slate-400 hover:text-white disabled:text-slate-600 hover:bg-slate-800 rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
              title="ทำซ้ำ (Redo - Ctrl+Y / Ctrl+Shift+Z)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Set Price Alert Button */}
        <button
          onClick={onOpenAlertModal}
          className="flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          <Bell className="w-3.5 h-3.5 fill-slate-950" />
          <span>+ แจ้งเตือน</span>
        </button>

        {/* Zoom & Pan tools */}
        <div className="flex items-center gap-1 ml-auto text-slate-400">
          <button
            onClick={() => handleZoom(-10)}
            className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="ขยาย (Zoom In)"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleZoom(10)}
            className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="ย่อ (Zoom Out)"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="รีเซ็ตกราฟ (Reset View)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* OHLCV Metrics Bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 bg-slate-950/40 border-b border-slate-800/60 text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-1.5 text-slate-200 font-sans font-semibold">
          <span>{symbol}</span>
          <span className="text-[10px] px-1 py-0.2 bg-slate-800 text-slate-300 rounded font-mono">{timeframe.toUpperCase()}</span>
          {isLive && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-sans font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              LIVE
            </span>
          )}
        </div>
        
        {displayCandle && (
          <div className="flex items-center gap-3 text-slate-300">
            <span>O: <span className="text-white">{displayCandle.open.toFixed(decimals)}</span></span>
            <span>H: <span className="text-white">{displayCandle.high.toFixed(decimals)}</span></span>
            <span>L: <span className="text-white">{displayCandle.low.toFixed(decimals)}</span></span>
            <span>C: <span className={candleChange >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>{displayCandle.close.toFixed(decimals)}</span></span>
            <span className={candleChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {candleChange >= 0 ? '+' : ''}{candleChange.toFixed(2)}%
            </span>
            <span>Vol: <span className="text-slate-300">{displayCandle.volume.toLocaleString()}</span></span>
          </div>
        )}

        {/* Tip for pan and zoom */}
        <div className="hidden lg:block ml-auto text-[10px] text-slate-400 font-sans">
          💡 ลากกราฟเพื่อเลื่อนอิสระ (ขึ้น-ลง และซ้าย-ขวา) | ลากแถบราคาด้านขวาเพื่อยืด/หดแกน Y | ดับเบิ้ลคลิกเพื่อรีเซ็ต Auto
        </div>
      </div>

      {/* Canvas Area */}
      <div 
        ref={containerRef}
        onWheel={handleWheel}
        className={`flex-1 relative w-full h-full min-h-[340px] overflow-hidden select-none ${
          isDraggingYAxis || isHoveringYAxis 
            ? 'cursor-ns-resize' 
            : isDrawingSr || isDrawingTrendline 
            ? 'cursor-crosshair' 
            : isDragging 
            ? 'cursor-grabbing' 
            : 'cursor-grab'
        }`}
      >
        {/* Trendline Drawing Hint Banner */}
        {isDrawingTrendline && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 bg-cyan-950/95 border border-cyan-400 text-cyan-200 text-xs rounded-full shadow-xl flex items-center gap-2.5 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            <span>
              {!trendlineStart
                ? '📍 คลิกจุดที่ 1 บนกราฟเพื่อเริ่มเส้น Trendline'
                : '🎯 คลิกจุดที่ 2 บนกราฟเพื่อสิ้นสุดเส้น Trendline'}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDrawingTrendline(false);
                setTrendlineStart(null);
                setMousePriceHover(null);
              }}
              className="ml-1 text-slate-400 hover:text-white font-bold text-xs cursor-pointer"
            >
              ยกเลิก
            </button>
          </div>
        )}

        {/* Drawing Hint Banner */}
        {isDrawingSr && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 bg-cyan-950/95 border border-cyan-400 text-cyan-200 text-xs rounded-full shadow-xl flex items-center gap-2.5 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            <span>คลิกบนกราฟเพื่อกำหนดตำแหน่งเส้นแนวรับ/ต้าน (S/R)</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDrawingSr(false);
              }}
              className="ml-1 text-slate-400 hover:text-white font-bold text-xs"
            >
              ยกเลิก
            </button>
          </div>
        )}

        {/* Floating Jump to Latest button when panned away from latest candle */}
        {panOffset !== 0 && (
          <button
            onClick={() => setPanOffset(0)}
            className="absolute bottom-3 right-24 z-30 flex items-center gap-1 px-2.5 py-1 bg-amber-500/90 hover:bg-amber-400 text-slate-950 text-[11px] font-bold rounded-full shadow-lg backdrop-blur transition-all cursor-pointer"
            title="เลื่อนกลับไปยังแท่งล่าสุด"
          >
            <span>▶ ไปแท่งล่าสุด</span>
          </button>
        )}

        {/* Auto scale reset button at bottom of price scale */}
        {(priceScaleMultiplier !== 1.0 || pricePanOffset !== 0) && (
          <button
            onClick={() => {
              setPriceScaleMultiplier(1.0);
              setPricePanOffset(0);
            }}
            className="absolute bottom-3 right-1.5 z-30 px-2 py-0.5 bg-cyan-950/90 border border-cyan-500 hover:bg-cyan-900 text-cyan-300 text-[10px] font-bold rounded shadow cursor-pointer transition-all flex items-center gap-1"
            title="รีเซ็ตสเกลแกน Y กลับเป็นอัตโนมัติ (หรือดับเบิ้ลคลิกที่แถบราคา)"
          >
            <span>Auto</span>
            <span className="font-mono text-[9px] text-cyan-400">({priceScaleMultiplier.toFixed(1)}x)</span>
          </button>
        )}

        <canvas
          ref={mainCanvasRef}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onDoubleClick={handleDoubleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleChartClick}
          className={`absolute inset-0 z-10 ${
            isDraggingYAxis || isHoveringYAxis 
              ? 'cursor-ns-resize' 
              : isDrawingSr || isDrawingTrendline 
              ? 'cursor-crosshair' 
              : isDragging 
              ? 'cursor-grabbing' 
              : 'cursor-grab'
          }`}
        />

        {/* Sub Indicator Canvas if RSI or MACD enabled */}
        {(indicators.showRSI || indicators.showMACD) && (
          <div className={`absolute bottom-0 left-0 right-0 ${indicators.showRSI && indicators.showMACD ? 'h-[220px]' : 'h-[120px]'} border-t border-slate-800/80 bg-slate-950/40 z-20`}>
            <canvas 
              ref={subCanvasRef} 
              onMouseMove={handleSubMouseMove}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className={`w-full h-full ${isDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
            />
          </div>
        )}
      </div>

      {/* Requirement 5: Support & Resistance Tester Inspector Panel */}
      {showSrPanel && srLevel !== null && (
        <div className="border-t border-slate-800 bg-slate-950/95 p-3 space-y-2.5 max-h-[260px] overflow-y-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <Compass className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-white">ทดสอบแนวรับ/ต้าน (S/R Level Tester)</span>
              <span className="px-2 py-0.5 bg-cyan-950 border border-cyan-800 rounded text-cyan-300 font-mono font-semibold">
                ${srLevel.toFixed(decimals)}
              </span>
              <span className="text-slate-400 text-[11px]">
                (พบการแตะทดสอบ {srTouches.length} แท่งเทียน)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsDrawingSr(true)}
                className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
              >
                ย้ายตำแหน่งเส้น
              </button>
              <button
                onClick={() => setShowSrPanel(false)}
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Volume Trend Assessment Card */}
          {srVolumeAnalysis ? (
            <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
              srVolumeAnalysis.isRising ? 'bg-rose-500/10 border-rose-500/30' : 'bg-emerald-500/10 border-emerald-500/30'
            }`}>
              <div className="flex items-center gap-2">
                <AlertTriangle className={`w-4 h-4 shrink-0 ${srVolumeAnalysis.isRising ? 'text-rose-400' : 'text-emerald-400'}`} />
                <span className={`font-semibold ${srVolumeAnalysis.isRising ? 'text-rose-300' : 'text-emerald-300'}`}>
                  {srVolumeAnalysis.text}
                </span>
              </div>
              <span className="text-[10px] text-slate-400">
                เปรียบเทียบโวลุ่มเฉลี่ยครึ่งแรก vs ครึ่งหลัง
              </span>
            </div>
          ) : (
            <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-400">
              พบการทดสอบ {srTouches.length} ครั้ง (ต้องมีการทดสอบอย่างน้อย 2 ครั้งเพื่อวิเคราะห์ทิศทางโวลุ่ม)
            </div>
          )}

          {/* Rule Warning: Do not count touches as strength */}
          <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-[11px] text-amber-300 flex items-center gap-2">
            <span className="font-bold">⚠️ กฎสำคัญ:</span>
            <span>ห้ามนับจำนวนครั้งที่ทดสอบเป็นความแข็งแรง ยิ่งทดสอบบ่อยด้วยโวลุ่มที่เพิ่มขึ้น แปลว่าแนวมีโอกาสทะลุสูง</span>
          </div>

          {/* Touches List Table */}
          {srTouches.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-[11px] text-left font-mono">
                <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-1 px-2.5">ครั้งที่</th>
                    <th className="py-1 px-2">วัน/เวลา</th>
                    <th className="py-1 px-2">แท่งเทียน</th>
                    <th className="py-1 px-2">ขนาดแท่ง (High-Low)</th>
                    <th className="py-1 px-2">โวลุ่ม (Volume)</th>
                    <th className="py-1 px-2">แนวโน้มโวลุ่ม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/60 text-slate-300">
                  {srTouches.map((t, i) => (
                    <tr key={i} className="hover:bg-slate-800/40">
                      <td className="py-1 px-2.5 font-bold text-slate-400">#{i + 1}</td>
                      <td className="py-1 px-2 text-slate-300">{t.dateStr}</td>
                      <td className="py-1 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold ${
                          t.isBullish ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {t.isBullish ? 'เขียว (Bull)' : 'แดง (Bear)'}
                        </span>
                      </td>
                      <td className="py-1 px-2 text-white">
                        ${t.candleSize.toFixed(decimals)} ({t.candleSizePct.toFixed(2)}%)
                      </td>
                      <td className="py-1 px-2 text-white">
                        {t.volume.toLocaleString()}
                      </td>
                      <td className="py-1 px-2">
                        {t.volumeTrendVsPrev === 'up' && (
                          <span className="text-rose-400 font-bold">▲ โวลุ่มเพิ่ม</span>
                        )}
                        {t.volumeTrendVsPrev === 'down' && (
                          <span className="text-emerald-400 font-bold">▼ โวลุ่มลด</span>
                        )}
                        {t.volumeTrendVsPrev === 'same' && (
                          <span className="text-slate-400">— คงที่</span>
                        )}
                        {!t.volumeTrendVsPrev && (
                          <span className="text-slate-500">แท่งแรก</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-3 text-center text-xs text-slate-500">
              ไม่มีแท่งเทียนที่แตะระดับราคานี้ในช่วงกราฟที่แสดง
            </div>
          )}
        </div>
      )}
    </div>
  );
};
