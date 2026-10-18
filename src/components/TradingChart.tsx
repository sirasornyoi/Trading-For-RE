import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Candle, ChartType, IndicatorSettings, PriceAlert, Timeframe } from '../types/trading';
import { calculateEMA, calculateBollingerBands, calculateRSI, calculateMACD } from '../services/marketData';
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
  Sparkles
} from 'lucide-react';

export interface VisiblePriceRange {
  minPrice: number;
  maxPrice: number;
  maxVolume: number;
  paddedRange: number;
}

export function computeVisiblePriceRange(
  visibleCandles: Candle[],
  symbolAlerts: PriceAlert[]
): VisiblePriceRange {
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let maxVolume = 0;

  visibleCandles.forEach(c => {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
    if (c.volume > maxVolume) maxVolume = c.volume;
  });

  if (minPrice === Infinity || maxPrice === -Infinity) {
    return { minPrice: 0, maxPrice: 100, maxVolume: 0, paddedRange: 100 };
  }

  // Also include active alert prices in the range if nearby to avoid clipping
  symbolAlerts.forEach(a => {
    if (a.targetPrice < minPrice && minPrice - a.targetPrice < (maxPrice - minPrice) * 0.3) {
      minPrice = a.targetPrice;
    }
    if (a.targetPrice > maxPrice && a.targetPrice - maxPrice < (maxPrice - minPrice) * 0.3) {
      maxPrice = a.targetPrice;
    }
  });

  // Add padding to price range
  const priceRange = maxPrice - minPrice || 1;
  minPrice -= priceRange * 0.05;
  maxPrice += priceRange * 0.05;
  const paddedRange = maxPrice - minPrice;

  return { minPrice, maxPrice, maxVolume, paddedRange };
}

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

  // Support & Resistance Tester state
  const [srLevel, setSrLevel] = useState<number | null>(null);
  const [isDrawingSr, setIsDrawingSr] = useState<boolean>(false);
  const [showSrPanel, setShowSrPanel] = useState<boolean>(false);

  // S/R Touches calculation: group consecutive candles that touch the level into ONE touch
  const srTouches = useMemo(() => {
    if (srLevel === null || candles.length === 0) return [];
    const tolerance = srLevel * 0.003;
    const minL = srLevel - tolerance;
    const maxL = srLevel + tolerance;

    const list: Array<{
      index: number;
      startTime: number;
      startDateStr: string;
      candleCount: number;
      totalVolume: number;
      maxRange: number;
      high: number;
      low: number;
    }> = [];

    let currentGroup: {
      startTime: number;
      startDateStr: string;
      candleCount: number;
      totalVolume: number;
      maxRange: number;
      high: number;
      low: number;
    } | null = null;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const touches = c.low <= maxL && c.high >= minL;

      if (touches) {
        const range = c.high - c.low;
        if (!currentGroup) {
          const d = new Date(c.time * 1000);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const hh = String(d.getHours()).padStart(2, '0');
          const min = String(d.getMinutes()).padStart(2, '0');
          currentGroup = {
            startTime: c.time,
            startDateStr: `${yyyy}-${mm}-${dd} ${hh}:${min}`,
            candleCount: 1,
            totalVolume: c.volume || 0,
            maxRange: range,
            high: c.high,
            low: c.low,
          };
        } else {
          currentGroup.candleCount += 1;
          currentGroup.totalVolume += c.volume || 0;
          currentGroup.maxRange = Math.max(currentGroup.maxRange, range);
          currentGroup.high = Math.max(currentGroup.high, c.high);
          currentGroup.low = Math.min(currentGroup.low, c.low);
        }
      } else {
        if (currentGroup) {
          list.push({
            index: list.length,
            ...currentGroup,
          });
          currentGroup = null;
        }
      }
    }

    if (currentGroup) {
      list.push({
        index: list.length,
        ...currentGroup,
      });
    }

    return list;
  }, [candles, srLevel]);

  // S/R Strength Assessment: Compare last 3 touches using grouped values (Never use touch count as strength)
  const srAssessment = useMemo(() => {
    if (srTouches.length < 3) {
      return {
        status: 'insufficient',
        text: 'ต้องการข้อมูลทดสอบอย่างน้อย 3 ครั้ง',
        detail: `ตรวจพบการสัมผัสระดับ ${srTouches.length} ครั้ง (ต้องใช้ข้อมูล 3 ครั้งล่าสุดเพื่อเปรียบเทียบ Volume และ Range)`,
      };
    }

    const last3 = srTouches.slice(-3);
    const [t1, t2, t3] = last3;

    // volume AND range rising → "Level อ่อนลง"
    const isVolRising = t3.totalVolume > t2.totalVolume && t2.totalVolume > t1.totalVolume;
    const isRangeRising = t3.maxRange > t2.maxRange && t2.maxRange > t1.maxRange;

    // volume falling → "Level ยังแข็ง"
    const isVolFalling = t3.totalVolume < t2.totalVolume && t2.totalVolume < t1.totalVolume;

    if (isVolRising && isRangeRising) {
      return {
        status: 'weak',
        text: 'Level อ่อนลง',
        detail: 'Volume รวม และ Max Range เพิ่มขึ้นต่อเนื่องในการทดสอบ 3 ครั้งล่าสุด (แรงทะลุเพิ่มขึ้น)',
      };
    }

    if (isVolFalling) {
      return {
        status: 'strong',
        text: 'Level ยังแข็ง',
        detail: 'Volume รวมลดลงต่อเนื่องในการทดสอบ 3 ครั้งล่าสุด (แรงกดดันลดลง แนวรับ/ต้านยังต้านอยู่)',
      };
    }

    return {
      status: 'neutral',
      text: 'รอสัญญาณยืนยัน',
      detail: 'แนวโน้ม Volume รวม และ Max Range ของ 3 ครั้งล่าสุดยังไม่เข้าเกณฑ์ชัดเจน',
    };
  }, [srTouches]);

  // Viewport zoom & pan offset
  const [visibleCount, setVisibleCount] = useState<number>(60);
  const [panOffset, setPanOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [dragStartPan, setDragStartPan] = useState<number>(0);

  // Mouse crosshair position
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; candle: Candle | null; price: number | null } | null>(null);

  // Filter alerts for current symbol
  const symbolAlerts = useMemo(() => {
    return alerts.filter(a => a.symbol === symbol && a.status === 'active');
  }, [alerts, symbol]);

  // Handle zoom in/out
  const handleZoom = (delta: number) => {
    setVisibleCount(prev => Math.min(Math.max(20, prev + delta), Math.max(30, candles.length)));
  };

  const handleResetZoom = () => {
    setVisibleCount(60);
    setPanOffset(0);
  };

  // Slice visible candles according to panOffset and visibleCount
  const visibleCandles = useMemo(() => {
    const total = candles.length;
    if (total === 0) return [];
    const end = Math.max(1, total - panOffset);
    const start = Math.max(0, end - visibleCount);
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
    const candleCount = visibleCandles.length;
    const slotWidth = chartWidth / candleCount;
    const candleWidth = Math.max(2 * dpr, slotWidth * 0.72);

    // Calculate visible Price Range (Min & Max) using shared function
    const { minPrice, maxPrice, maxVolume, paddedRange } = computeVisiblePriceRange(visibleCandles, symbolAlerts);

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

    // Draw vertical time grid lines & date stamps
    const timeStep = Math.max(1, Math.floor(candleCount / 6));
    for (let i = 0; i < candleCount; i += timeStep) {
      const x = i * slotWidth + slotWidth / 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, chartHeight);
      ctx.stroke();

      const candle = visibleCandles[i];
      if (candle) {
        const d = new Date(candle.time * 1000);
        const timeStr = timeframe === '1d' || timeframe === '1w' || isWeeklyView
          ? `${d.getMonth() + 1}/${d.getDate()}`
          : `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        ctx.fillStyle = '#64748b';
        ctx.font = `${10 * dpr}px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(timeStr, x, chartHeight + 14 * dpr);
      }
    }

    // Volume bars (at bottom of chart)
    const startGlobalIdx = candles.length - panOffset - visibleCount;
    if (indicators.showVolume && maxVolume > 0) {
      const volumeAreaHeight = chartHeight * 0.2;
      visibleCandles.forEach((c, idx) => {
        const x = idx * slotWidth + (slotWidth - candleWidth) / 2;
        const vHeight = (c.volume / maxVolume) * volumeAreaHeight;
        const isUp = c.close >= c.open;

        // Requirement 3: Highlight volume bar when volume is higher than previous candle's volume
        const globalIdx = startGlobalIdx + idx;
        const prevCandle = globalIdx > 0 ? candles[globalIdx - 1] : (idx > 0 ? visibleCandles[idx - 1] : null);
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
      });
    }

    // Bollinger Bands Cloud
    if (indicators.showBollinger && indicatorData?.bb) {
      const { upper, middle, lower } = indicatorData.bb;
      
      // Fill band area
      ctx.beginPath();
      let first = true;
      for (let i = 0; i < candleCount; i++) {
        const gIdx = Math.max(0, startGlobalIdx + i);
        const u = upper[gIdx];
        if (u !== null && u !== undefined) {
          const x = i * slotWidth + slotWidth / 2;
          const y = priceToY(u);
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      for (let i = candleCount - 1; i >= 0; i--) {
        const gIdx = Math.max(0, startGlobalIdx + i);
        const l = lower[gIdx];
        if (l !== null && l !== undefined) {
          const x = i * slotWidth + slotWidth / 2;
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
        for (let i = 0; i < candleCount; i++) {
          const gIdx = Math.max(0, startGlobalIdx + i);
          const val = arr[gIdx];
          if (val !== null && val !== undefined) {
            const x = i * slotWidth + slotWidth / 2;
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

    // EMA 20 & EMA 50 Lines
    const drawIndicatorLine = (series: (number | null)[] | null, color: string, lineWidth: number = 1.5) => {
      if (!series) return;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth * dpr;
      let started = false;

      for (let i = 0; i < candleCount; i++) {
        const gIdx = Math.max(0, startGlobalIdx + i);
        const val = series[gIdx];
        if (val !== null && val !== undefined) {
          const x = i * slotWidth + slotWidth / 2;
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
      visibleCandles.forEach((c, idx) => {
        const x = idx * slotWidth + (slotWidth - candleWidth) / 2;
        const centerX = x + candleWidth / 2;
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
        const globalIdx = startGlobalIdx + idx;
        if (showBullishEngulfing && globalIdx > 0) {
          const prev = candles[globalIdx - 1];
          const isPrevRed = prev.close < prev.open;
          const isCurrGreen = c.close > c.open;
          const isEngulfingBody = isPrevRed && isCurrGreen && c.close > prev.open && c.open <= (prev.close + Math.abs(prev.open - prev.close) * 0.2);

          if (isEngulfingBody) {
            const closesAboveRedHigh = c.close > prev.high;
            const volHigher = c.volume > prev.volume;

            let text = '';
            let isGreen = false;

            if (closesAboveRedHigh && volHigher) {
              text = 'Buyer จริง';
              isGreen = true;
            } else if (closesAboveRedHigh && !volHigher) {
              text = 'ปิดเหนือ แต่ volume ต่ำ';
              isGreen = false;
            } else {
              text = 'อาจเป็น short covering — รอแท่งยืนยันที่ 2';
              isGreen = false;
            }

            const badgeY = priceToY(c.low) + 6 * dpr;

            ctx.save();
            ctx.font = `bold ${8.5 * dpr}px 'Plus Jakarta Sans', sans-serif`;
            const textWidth = ctx.measureText(text).width;
            const badgeW = textWidth + 8 * dpr;
            const badgeH = 14 * dpr;
            const badgeX = centerX - badgeW / 2;

            ctx.fillStyle = isGreen ? 'rgba(16, 185, 129, 0.95)' : 'rgba(245, 158, 11, 0.95)';
            if (ctx.roundRect) {
              ctx.beginPath();
              ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3 * dpr);
              ctx.fill();
            } else {
              ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
            }

            ctx.fillStyle = isGreen ? '#022c22' : '#451a03';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, centerX, badgeY + badgeH / 2);
            ctx.restore();
          }
        }
      });
    } else {
      // Area / Line Chart mode
      ctx.beginPath();
      visibleCandles.forEach((c, idx) => {
        const x = idx * slotWidth + slotWidth / 2;
        const y = priceToY(c.close);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      // Area gradient
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();

      ctx.lineTo((candleCount - 1) * slotWidth + slotWidth / 2, chartHeight);
      ctx.lineTo(slotWidth / 2, chartHeight);
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

    // Support & Resistance horizontal level line and ±0.3% tolerance zone
    if (srLevel !== null) {
      const srY = priceToY(srLevel);
      if (srY >= 0 && srY <= chartHeight) {
        ctx.save();

        // ±0.3% tolerance zone band
        const tolerance = srLevel * 0.003;
        const topY = priceToY(srLevel + tolerance);
        const botY = priceToY(srLevel - tolerance);
        ctx.fillStyle = 'rgba(6, 182, 212, 0.12)';
        ctx.fillRect(0, Math.min(topY, botY), chartWidth, Math.abs(botY - topY));

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

    // Crosshair rendering
    if (crosshair && crosshair.x >= 0 && crosshair.x <= chartWidth && crosshair.y >= 0 && crosshair.y <= chartHeight) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([3 * dpr, 3 * dpr]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(crosshair.x, 0);
      ctx.lineTo(crosshair.x, chartHeight);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, crosshair.y);
      ctx.lineTo(chartWidth, crosshair.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Crosshair Price Tag on Right Axis
      const hoverPrice = yToPrice(crosshair.y);
      ctx.fillStyle = '#334155';
      const cTagHeight = 18 * dpr;
      ctx.fillRect(chartWidth + 2 * dpr, crosshair.y - cTagHeight / 2, rightPadding - 4 * dpr, cTagHeight);

      ctx.fillStyle = '#f8fafc';
      ctx.font = `${10 * dpr}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hoverPrice.toFixed(decimals), chartWidth + (rightPadding - 4 * dpr) / 2 + 2 * dpr, crosshair.y);
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
    isWeeklyView
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
    const candleCount = visibleCandles.length;
    const slotWidth = chartWidth / candleCount;
    const startGlobalIdx = candles.length - panOffset - visibleCount;

    if (indicators.showRSI && indicatorData?.rsi) {
      // Draw RSI (0 - 100)
      const rsiSeries = indicatorData.rsi;
      const rsiToY = (val: number) => height - (val / 100) * height;

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
      ctx.font = `${9 * dpr}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'left';
      ctx.fillText('70 OB', chartWidth + 6 * dpr, rsiToY(70) + 3 * dpr);
      ctx.fillText('30 OS', chartWidth + 6 * dpr, rsiToY(30) + 3 * dpr);

      // Plot RSI line
      ctx.beginPath();
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 1.8 * dpr;
      let started = false;
      let lastVal: number | null = null;

      for (let i = 0; i < candleCount; i++) {
        const gIdx = Math.max(0, startGlobalIdx + i);
        const val = rsiSeries[gIdx];
        if (val !== null && val !== undefined) {
          lastVal = val;
          const x = i * slotWidth + slotWidth / 2;
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

      // Current RSI label
      ctx.fillStyle = '#a855f7';
      ctx.font = `bold ${10 * dpr}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(`RSI (14): ${lastVal !== null ? lastVal.toFixed(1) : '--'}`, 12 * dpr, 14 * dpr);

    } else if (indicators.showMACD && indicatorData?.macd) {
      // MACD Sub-Pane
      const { macdLine, signalLine, histogram } = indicatorData.macd;
      let maxAbs = 1;
      for (let i = 0; i < candleCount; i++) {
        const gIdx = Math.max(0, startGlobalIdx + i);
        if (macdLine[gIdx]) maxAbs = Math.max(maxAbs, Math.abs(macdLine[gIdx]!));
        if (signalLine[gIdx]) maxAbs = Math.max(maxAbs, Math.abs(signalLine[gIdx]!));
        if (histogram[gIdx]) maxAbs = Math.max(maxAbs, Math.abs(histogram[gIdx]!));
      }
      maxAbs *= 1.2;

      const macdToY = (val: number) => (height / 2) - (val / maxAbs) * (height / 2);

      // Zero line
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(chartWidth, height / 2);
      ctx.stroke();

      // Histogram bars
      const barW = Math.max(2 * dpr, slotWidth * 0.6);
      for (let i = 0; i < candleCount; i++) {
        const gIdx = Math.max(0, startGlobalIdx + i);
        const hist = histogram[gIdx];
        if (hist !== null && hist !== undefined) {
          const x = i * slotWidth + (slotWidth - barW) / 2;
          const y = macdToY(hist);
          const zeroY = height / 2;
          ctx.fillStyle = hist >= 0 ? '#10b981' : '#ef4444';
          ctx.fillRect(x, Math.min(y, zeroY), barW, Math.abs(y - zeroY));
        }
      }

      // MACD Line
      ctx.beginPath();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5 * dpr;
      let started = false;
      for (let i = 0; i < candleCount; i++) {
        const gIdx = Math.max(0, startGlobalIdx + i);
        const val = macdLine[gIdx];
        if (val !== null && val !== undefined) {
          const x = i * slotWidth + slotWidth / 2;
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
      for (let i = 0; i < candleCount; i++) {
        const gIdx = Math.max(0, startGlobalIdx + i);
        const val = signalLine[gIdx];
        if (val !== null && val !== undefined) {
          const x = i * slotWidth + slotWidth / 2;
          const y = macdToY(val);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else { ctx.lineTo(x, y); }
        }
      }
      ctx.stroke();

      // MACD Title
      ctx.fillStyle = '#94a3b8';
      ctx.font = `bold ${10 * dpr}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'left';
      ctx.fillText('MACD (12, 26, 9)', 12 * dpr, 14 * dpr);
    }
  }, [
    visibleCandles, 
    indicators, 
    indicatorData, 
    panOffset, 
    visibleCount, 
    candles.length
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
      const hasSubChart = indicators.showRSI || indicators.showMACD;
      const subHeight = hasSubChart ? 120 : 0;
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
  }, [indicators.showRSI, indicators.showMACD, drawMainChart, drawSubChart, showSrPanel, srLevel]);

  // Trigger redraw on state updates
  useEffect(() => {
    drawMainChart();
    drawSubChart();
  }, [drawMainChart, drawSubChart]);

  // Mouse interaction handlers for crosshair & dragging
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const mouseX = (e.clientX - rect.left) * dpr;
    const mouseY = (e.clientY - rect.top) * dpr;

    // Handle Pan Dragging
    if (isDragging) {
      const deltaX = (e.clientX - dragStartX);
      const candleSlotPx = rect.width / visibleCount;
      const candleDelta = Math.round(deltaX / candleSlotPx);
      const newOffset = Math.max(0, Math.min(candles.length - visibleCount, dragStartPan + candleDelta));
      setPanOffset(newOffset);
      return;
    }

    // Determine hover candle
    const rightPadding = 75 * dpr;
    const chartWidth = canvas.width - rightPadding;
    const slotWidth = chartWidth / visibleCandles.length;
    const candleIdx = Math.floor(mouseX / slotWidth);
    const candle = visibleCandles[candleIdx] || null;

    setCrosshair({
      x: mouseX,
      y: mouseY,
      candle,
      price: null, // calculated in draw
    });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartPan(panOffset);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setCrosshair(null);
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoom(-5);
    } else {
      handleZoom(5);
    }
  };

  // Chart Click: S/R placement or Quick 1-click price alert
  const handleChartClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) return;
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const clickY = (e.clientY - rect.top) * dpr;
    
    const bottomPadding = 25 * dpr;
    const chartHeight = canvas.height - bottomPadding;

    if (clickY > chartHeight || visibleCandles.length === 0) return;

    const { minPrice, paddedRange } = computeVisiblePriceRange(visibleCandles, symbolAlerts);
    const clickedPrice = minPrice + (1 - clickY / chartHeight) * paddedRange;
    if (clickedPrice > 0 && clickY <= chartHeight) {
      if (isDrawingSr) {
        setSrLevel(Number(clickedPrice.toFixed(decimals)));
        setIsDrawingSr(false);
        setShowSrPanel(true);
      } else {
        onQuickAddAlert(Number(clickedPrice.toFixed(decimals)));
      }
    }
  };

  // Metrics bar values: use crosshair candle if hovering, or latest candle
  const displayCandle = crosshair?.candle || (visibleCandles.length > 0 ? visibleCandles[visibleCandles.length - 1] : null);
  const candleChange = displayCandle ? ((displayCandle.close - displayCandle.open) / displayCandle.open) * 100 : 0;

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden select-none">
      {/* Chart Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-800 bg-slate-950/70 text-xs">
        {/* Timeframe selector */}
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

        {/* Indicators Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowIndicatorsMenu(!showIndicatorsMenu)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${
              showIndicatorsMenu
                ? 'bg-slate-800 border-slate-600 text-amber-400'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>อินดิเคเตอร์</span>
          </button>

          {showIndicatorsMenu && (
            <div className="absolute left-0 mt-1.5 w-48 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-2 z-30 text-xs">
              <div className="text-[11px] font-semibold text-slate-400 px-2 py-1 border-b border-slate-800 mb-1">
                เครื่องมือวิเคราะห์กราฟ
              </div>
              <button
                onClick={() => setIndicators(prev => ({ ...prev, showEMA20: !prev.showEMA20 }))}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-800/70 text-slate-200"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
                  <span>EMA 20</span>
                </div>
                {indicators.showEMA20 ? <Eye className="w-3.5 h-3.5 text-cyan-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
              </button>
              <button
                onClick={() => setIndicators(prev => ({ ...prev, showEMA50: !prev.showEMA50 }))}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-800/70 text-slate-200"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                  <span>EMA 50</span>
                </div>
                {indicators.showEMA50 ? <Eye className="w-3.5 h-3.5 text-amber-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
              </button>
              <button
                onClick={() => setIndicators(prev => ({ ...prev, showBollinger: !prev.showBollinger }))}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-800/70 text-slate-200"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-400"></span>
                  <span>Bollinger Bands</span>
                </div>
                {indicators.showBollinger ? <Eye className="w-3.5 h-3.5 text-purple-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
              </button>
              <button
                onClick={() => setIndicators(prev => ({ ...prev, showRSI: !prev.showRSI, showMACD: prev.showRSI ? prev.showMACD : false }))}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-800/70 text-slate-200"
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-purple-400" />
                  <span>RSI (14)</span>
                </div>
                {indicators.showRSI ? <Eye className="w-3.5 h-3.5 text-purple-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
              </button>
              <button
                onClick={() => setIndicators(prev => ({ ...prev, showMACD: !prev.showMACD, showRSI: prev.showMACD ? prev.showRSI : false }))}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-800/70 text-slate-200"
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  <span>MACD</span>
                </div>
                {indicators.showMACD ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
              </button>
              <button
                onClick={() => setIndicators(prev => ({ ...prev, showVolume: !prev.showVolume }))}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-800/70 text-slate-200"
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  <span>โวลุ่มการเทรด</span>
                </div>
                {indicators.showVolume ? <Eye className="w-3.5 h-3.5 text-blue-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
              </button>
            </div>
          )}
        </div>

        {/* Set Price Alert Button */}
        <button
          onClick={onOpenAlertModal}
          className="flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          <Bell className="w-3.5 h-3.5 fill-slate-950" />
          <span>+ ตั้งแจ้งเตือนราคา</span>
        </button>

        {/* S/R Tester Draw Button */}
        <button
          onClick={() => {
            if (isDrawingSr) {
              setIsDrawingSr(false);
            } else {
              setIsDrawingSr(true);
              setShowSrPanel(true);
            }
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer ${
            isDrawingSr
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 ring-1 ring-cyan-400 animate-pulse'
              : srLevel !== null
              ? 'bg-slate-800 border-cyan-500/60 text-cyan-400'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
          }`}
          title="วาดเส้น S/R บนกราฟ"
        >
          <Compass className="w-3.5 h-3.5 text-cyan-400" />
          <span>{isDrawingSr ? 'คลิกบนกราฟเพื่อวางเส้น S/R' : 'วาดเส้น S/R'}</span>
        </button>

        {/* Clear S/R Level Button */}
        {srLevel !== null && (
          <button
            onClick={() => {
              setSrLevel(null);
              setIsDrawingSr(false);
              setShowSrPanel(false);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-800 bg-slate-900 hover:bg-rose-950/40 hover:border-rose-700/60 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer text-[11px]"
            title="ลบระดับเส้น S/R"
          >
            <X className="w-3.5 h-3.5" />
            <span>ล้างเส้น S/R</span>
          </button>
        )}

        {/* Toggle S/R Side Panel */}
        {srLevel !== null && !showSrPanel && (
          <button
            onClick={() => setShowSrPanel(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg border border-cyan-800 bg-cyan-950/40 text-cyan-400 text-[11px] hover:bg-cyan-900/40 cursor-pointer"
          >
            <span>ผลทดสอบ S/R</span>
          </button>
        )}

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

        {/* Tip for 1-click alert */}
        <div className="hidden lg:block ml-auto text-[10px] text-slate-500 font-sans">
          💡 คลิกบนกราฟเพื่อตั้งการแจ้งเตือนราคาจุดนั้นทันที
        </div>
      </div>

      {/* Chart Canvas & S/R Side Panel Area */}
      <div className="flex-1 flex w-full h-full min-h-[340px] overflow-hidden relative">
        <div 
          ref={containerRef}
          onWheel={handleWheel}
          className="flex-1 relative h-full min-h-[340px] cursor-crosshair overflow-hidden"
        >
          {isDrawingSr && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full bg-cyan-500 text-slate-950 font-bold text-xs shadow-lg flex items-center gap-2 pointer-events-none animate-bounce">
              <Compass className="w-4 h-4 animate-spin" />
              <span>คลิกตำแหน่งบนกราฟเพื่อวางเส้น S/R</span>
            </div>
          )}

          <canvas
            ref={mainCanvasRef}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onClick={handleChartClick}
            className="absolute inset-0 z-10"
          />

          {/* Sub Indicator Canvas if RSI or MACD enabled */}
          {(indicators.showRSI || indicators.showMACD) && (
            <div className="absolute bottom-0 left-0 right-0 h-[120px] border-t border-slate-800/80 bg-slate-950/40 z-20">
              <canvas ref={subCanvasRef} className="w-full h-full" />
            </div>
          )}
        </div>

        {/* S/R Tester Side Panel */}
        {srLevel !== null && showSrPanel && (
          <aside className="w-72 lg:w-80 bg-slate-950/95 border-l border-slate-800 flex flex-col z-20 shrink-0">
            {/* Header */}
            <div className="p-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-xs text-white">ผลทดสอบ S/R (Support/Resistance)</span>
              </div>
              <button
                onClick={() => setShowSrPanel(false)}
                className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
                title="ปิดแถบข้าง"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Level info & Strength Evaluation */}
            <div className="p-3 border-b border-slate-800/80 space-y-2.5">
              <div className="bg-slate-900/90 rounded-lg p-2.5 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-medium">ระดับที่ทดสอบ (S/R Level)</div>
                <div className="text-base font-mono font-bold text-cyan-400">
                  {srLevel.toFixed(decimals)}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  ช่วงทดสอบ ±0.3%: {(srLevel * 0.997).toFixed(decimals)} - {(srLevel * 1.003).toFixed(decimals)}
                </div>
              </div>

              {/* Strength Assessment Box */}
              <div className={`p-2.5 rounded-lg border ${
                srAssessment.status === 'strong'
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                  : srAssessment.status === 'weak'
                  ? 'bg-amber-950/40 border-amber-500/50 text-amber-300'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">การประเมินความแข็งแกร่ง</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                    srAssessment.status === 'strong'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : srAssessment.status === 'weak'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {srAssessment.text}
                  </span>
                </div>
                <div className="text-[11px] leading-relaxed">
                  {srAssessment.detail}
                </div>
                <div className="text-[10px] text-slate-400 mt-1.5 pt-1.5 border-t border-slate-800/60">
                  * กฎการประเมิน: เปรียบเทียบ Volume และ Range ของ 3 ครั้งล่าสุด (ไม่ใช้จำนวนครั้งวัดความแข็งแกร่ง)
                </div>
              </div>

              {/* Action Buttons: Set New & Clear Level */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => setIsDrawingSr(true)}
                  className="py-1.5 px-2 bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>วาดจุดใหม่</span>
                </button>
                <button
                  onClick={() => {
                    setSrLevel(null);
                    setIsDrawingSr(false);
                    setShowSrPanel(false);
                  }}
                  className="py-1.5 px-2 bg-slate-900 hover:bg-rose-950/40 text-rose-400 border border-slate-800 hover:border-rose-500/40 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>ลบเส้น S/R</span>
                </button>
              </div>
            </div>

            {/* Touches List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span>รายการสัมผัส (Touches)</span>
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/50">
                  {srTouches.length} ครั้ง
                </span>
              </div>

              {srTouches.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  ไม่พบแท่งเทียนที่สัมผัสระดับนี้ในช่วง ±0.3%
                </div>
              ) : (
                <div className="space-y-1.5">
                  {[...srTouches].reverse().map((touch, i) => {
                    const originalIdx = srTouches.length - 1 - i;
                    const isLast3 = originalIdx >= srTouches.length - 3;
                    return (
                      <div
                        key={`${touch.startTime}-${originalIdx}`}
                        className={`p-2.5 rounded-lg border text-[11px] font-mono ${
                          isLast3
                            ? 'bg-slate-900 border-cyan-500/40 text-slate-200'
                            : 'bg-slate-900/50 border-slate-800/80 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-slate-300 font-sans">
                            #{originalIdx + 1} {touch.startDateStr}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300 font-sans font-medium">
                              {touch.candleCount} แท่ง
                            </span>
                            {isLast3 && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-sans font-semibold">
                                3 ครั้งล่าสุด
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span>Vol รวม: <span className="text-white font-mono">{Math.round(touch.totalVolume).toLocaleString()}</span></span>
                          <span>Max Range: <span className="text-white font-mono">{touch.maxRange.toFixed(decimals)}</span></span>
                        </div>
                        <div className="text-[9px] text-slate-500 mt-0.5">
                          High: {touch.high.toFixed(decimals)} | Low: {touch.low.toFixed(decimals)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
