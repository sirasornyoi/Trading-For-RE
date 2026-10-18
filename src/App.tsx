import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Asset, 
  Candle, 
  PriceAlert, 
  Timeframe 
} from './types/trading';
import { 
  INITIAL_ASSETS, 
  fetchBinanceKlines, 
  parseTradingViewCSV, 
  getStoredCandles, 
  setStoredCandles,
  detectCandleTimeframe,
  aggregateDailyToWeekly,
} from './services/marketData';
import { soundService } from './services/sound';
import { TopNav } from './components/TopNav';
import { AssetSelector } from './components/AssetSelector';
import { TradingChart } from './components/TradingChart';
import { AlertModal } from './components/AlertModal';
import { AlertDrawer } from './components/AlertDrawer';
import { AlertNotificationToast } from './components/AlertNotificationToast';
import { RiskCalculator } from './components/RiskCalculator';
import { MarketAnalysisView } from './components/MarketAnalysisView';
import { UploadCloud, FileSpreadsheet, Trash2, CheckCircle, AlertCircle } from 'lucide-react';

const ALERTS_STORAGE_KEY = 'apextrade_alerts_v2';

function formatCandleDate(timestampSec: number): string {
  const d = new Date(timestampSec * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export default function App() {
  const [activeView, setActiveView] = useState<'trade' | 'alerts' | 'calculator' | 'analysis'>('trade');

  // Master asset list without any hardcoded/simulated prices
  const [assets, setAssets] = useState<Asset[]>(() => {
    return INITIAL_ASSETS.map(asset => {
      // Check if CSV data is stored locally for this asset
      const stored = getStoredCandles(asset.symbol);
      if (stored && stored.length > 0) {
        const last = stored[stored.length - 1];
        const prev = stored.length > 1 ? stored[stored.length - 2] : last;
        const change = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;
        const tf = detectCandleTimeframe(stored);
        return {
          ...asset,
          price: last.close,
          changeVsPrevCandle: Number(change.toFixed(2)),
          lastCandleDate: formatCandleDate(last.time),
          dataSource: 'CSV Upload',
          csvTimeframe: tf,
        };
      }
      return asset;
    });
  });

  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC/USDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isLiveWs, setIsLiveWs] = useState<boolean>(false);
  const [csvUploadError, setCsvUploadError] = useState<string | null>(null);
  const [csvUploadSuccess, setCsvUploadSuccess] = useState<string | null>(null);
  const [isWeeklyView, setIsWeeklyView] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Price Alerts (delete default sample alerts; only load user saved alerts or empty)
  const [alerts, setAlerts] = useState<PriceAlert[]>(() => {
    try {
      const saved = localStorage.getItem(ALERTS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [activeAlertToast, setActiveAlertToast] = useState<PriceAlert | null>(null);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState<boolean>(false);
  const [prefilledAlertPrice, setPrefilledAlertPrice] = useState<number | null>(null);
  const [isAlertDrawerOpen, setIsAlertDrawerOpen] = useState<boolean>(false);

  const currentAsset = assets.find(a => a.symbol === selectedSymbol) || assets[0];
  const isBinanceAsset = selectedSymbol === 'BTC/USDT' || selectedSymbol === 'ETH/USDT';

  const isCsvDaily = !isBinanceAsset && !!(currentAsset.csvTimeframe?.toLowerCase().includes('d') || currentAsset.csvTimeframe?.toLowerCase().includes('day') || currentAsset.csvTimeframe === '1D' || currentAsset.csvTimeframe === '1d');

  const displayedCandles = useMemo(() => {
    if (isCsvDaily && isWeeklyView) {
      return aggregateDailyToWeekly(candles);
    }
    return candles;
  }, [candles, isCsvDaily, isWeeklyView]);

  // Save alerts to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
    } catch {}
  }, [alerts]);

  // Check alerts against real price update
  const checkPriceAlerts = useCallback((symbol: string, newPrice: number) => {
    setAlerts(prevAlerts => {
      let triggeredOne: PriceAlert | null = null;

      const updated = prevAlerts.map(alert => {
        if (alert.symbol !== symbol) {
          return alert;
        }

        // For recurring alerts that triggered, check if price crossed back to re-arm
        if (alert.recurring && alert.status === 'active' && alert.armed === false) {
          if (alert.condition === 'gte' && newPrice < alert.targetPrice) {
            return { ...alert, armed: true };
          }
          if (alert.condition === 'lte' && newPrice > alert.targetPrice) {
            return { ...alert, armed: true };
          }
          return alert;
        }

        if (alert.status !== 'active' || alert.armed === false) {
          return alert;
        }

        const isTriggered = alert.condition === 'gte'
          ? newPrice >= alert.targetPrice
          : newPrice <= alert.targetPrice;

        if (isTriggered) {
          const nextStatus: 'active' | 'triggered' = alert.recurring ? 'active' : 'triggered';
          triggeredOne = {
            ...alert,
            status: nextStatus,
            armed: false,
            triggeredAt: Date.now(),
          };

          if (alert.soundEnabled && soundService.enabled) {
            soundService.playPriceAlertSound();
          }

          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(`🔔 แจ้งเตือนราคา: ${alert.symbol}`, {
                body: `ราคาถึงเป้าหมาย $${alert.targetPrice} แล้ว (ราคาล่าสุด $${newPrice.toFixed(2)}) ${alert.note ? `- ${alert.note}` : ''}`,
                icon: '/favicon.ico',
              });
            } catch {}
          }

          return {
            ...alert,
            status: nextStatus,
            armed: false,
            triggeredAt: Date.now(),
          };
        }

        return alert;
      });

      if (triggeredOne) {
        setActiveAlertToast(triggeredOne);
      }

      return updated;
    });
  }, []);

  // Load candle data for current selected asset
  useEffect(() => {
    setCsvUploadError(null);
    setCsvUploadSuccess(null);

    if (isBinanceAsset) {
      // Load real klines from Binance REST API for BTC or ETH
      let isMounted = true;
      fetchBinanceKlines(selectedSymbol, timeframe)
        .then(klineCandles => {
          if (!isMounted) return;
          if (klineCandles.length > 0) {
            setCandles(klineCandles);
            const last = klineCandles[klineCandles.length - 1];
            const prev = klineCandles.length > 1 ? klineCandles[klineCandles.length - 2] : last;
            const change = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;
            const lastDate = formatCandleDate(last.time);

            setAssets(prev => prev.map(a => {
              if (a.symbol === selectedSymbol) {
                return {
                  ...a,
                  price: last.close,
                  changeVsPrevCandle: Number(change.toFixed(2)),
                  lastCandleDate: lastDate,
                  dataSource: 'Binance',
                };
              }
              return a;
            }));

            // Check alerts on initial klines load
            checkPriceAlerts(selectedSymbol, last.close);
          }
        })
        .catch(err => {
          console.warn('Binance klines fetch failed:', err);
        });

      return () => {
        isMounted = false;
      };
    } else {
      // Load CSV data from localStorage for other assets
      const stored = getStoredCandles(selectedSymbol);
      if (stored && stored.length > 0) {
        setCandles(stored);
        const last = stored[stored.length - 1];
        const prev = stored.length > 1 ? stored[stored.length - 2] : last;
        const change = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;
        const lastDate = formatCandleDate(last.time);
        const tf = detectCandleTimeframe(stored);

        setAssets(prev => prev.map(a => {
          if (a.symbol === selectedSymbol) {
            return {
              ...a,
              price: last.close,
              changeVsPrevCandle: Number(change.toFixed(2)),
              lastCandleDate: lastDate,
              dataSource: 'CSV Upload',
              csvTimeframe: tf,
            };
          }
          return a;
        }));
      } else {
        setCandles([]);
        setAssets(prev => prev.map(a => {
          if (a.symbol === selectedSymbol) {
            return {
              ...a,
              price: undefined,
              changeVsPrevCandle: undefined,
              lastCandleDate: undefined,
              dataSource: null,
              csvTimeframe: undefined,
            };
          }
          return a;
        }));
      }
    }
  }, [selectedSymbol, timeframe, isBinanceAsset, checkPriceAlerts]);

  // Real Binance @kline_<interval> WebSocket for BTC and ETH real price updates
  useEffect(() => {
    if (!isBinanceAsset || typeof window === 'undefined') {
      setIsLiveWs(false);
      return;
    }

    let ws: WebSocket | null = null;
    const streamSymbol = selectedSymbol === 'BTC/USDT' ? 'btcusdt' : 'ethusdt';

    try {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamSymbol}@kline_${timeframe}`);
      ws.onopen = () => {
        setIsLiveWs(true);
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.k) {
            const k = data.k;
            const openTime = Math.floor(k.t / 1000);
            const open = parseFloat(k.o);
            const high = parseFloat(k.h);
            const low = parseFloat(k.l);
            const close = parseFloat(k.c);
            const volume = parseFloat(k.v);
            const isClosed = k.x === true;

            if (!isNaN(close)) {
              const formattedDate = formatCandleDate(openTime);

              // Check alerts on real price updates
              checkPriceAlerts(selectedSymbol, close);

              // Update candle series: update while open, append/finalize when closed
              setCandles(prevCandles => {
                if (prevCandles.length === 0) return prevCandles;

                const updatedCandle: Candle = {
                  time: openTime,
                  open,
                  high,
                  low,
                  close,
                  volume,
                };

                const lastIdx = prevCandles.length - 1;
                const isSameAsLast = prevCandles[lastIdx].time === openTime;

                // Calculate change vs previous candle from the last two candles
                let changePct = 0;
                if (isSameAsLast) {
                  if (prevCandles.length > 1) {
                    const prevC = prevCandles[prevCandles.length - 2];
                    changePct = prevC.close > 0 ? ((close - prevC.close) / prevC.close) * 100 : 0;
                  } else {
                    changePct = open > 0 ? ((close - open) / open) * 100 : 0;
                  }
                } else {
                  const prevC = prevCandles[lastIdx];
                  changePct = prevC.close > 0 ? ((close - prevC.close) / prevC.close) * 100 : 0;
                }

                setAssets(prevAssets => prevAssets.map(a => {
                  if (a.symbol === selectedSymbol) {
                    return {
                      ...a,
                      price: close,
                      changeVsPrevCandle: Number(changePct.toFixed(2)),
                      lastCandleDate: formattedDate,
                      dataSource: 'Binance',
                    };
                  }
                  return a;
                }));

                if (isClosed) {
                  if (isSameAsLast) {
                    return [...prevCandles.slice(0, lastIdx), updatedCandle];
                  } else {
                    return [...prevCandles, updatedCandle];
                  }
                } else {
                  // Update the last candle while it is open
                  if (isSameAsLast) {
                    const copy = [...prevCandles];
                    copy[lastIdx] = updatedCandle;
                    return copy;
                  } else {
                    return [...prevCandles, updatedCandle];
                  }
                }
              });
            }
          }
        } catch {}
      };
      ws.onerror = () => setIsLiveWs(false);
      ws.onclose = () => setIsLiveWs(false);
    } catch {
      setIsLiveWs(false);
    }

    return () => {
      if (ws) ws.close();
    };
  }, [selectedSymbol, timeframe, isBinanceAsset, checkPriceAlerts]);

  // Handle TradingView CSV File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvUploadError(null);
    setCsvUploadSuccess(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseTradingViewCSV(text);

        if (parsed.length === 0) {
          throw new Error('ไม่พบข้อมูลแท่งเทียนที่ถูกต้องในไฟล์ CSV (ต้องมีคอลัมน์: time, open, high, low, close)');
        }

        // Store parsed candles in localStorage
        setStoredCandles(selectedSymbol, parsed);
        setCandles(parsed);

        const last = parsed[parsed.length - 1];
        const prev = parsed.length > 1 ? parsed[parsed.length - 2] : last;
        const change = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;
        const lastDate = formatCandleDate(last.time);
        const tf = detectCandleTimeframe(parsed);

        setAssets(prev => prev.map(a => {
          if (a.symbol === selectedSymbol) {
            return {
              ...a,
              price: last.close,
              changeVsPrevCandle: Number(change.toFixed(2)),
              lastCandleDate: lastDate,
              dataSource: 'CSV Upload',
              csvTimeframe: tf,
            };
          }
          return a;
        }));

        // Check alerts on the last close of newly uploaded CSV
        checkPriceAlerts(selectedSymbol, last.close);

        setCsvUploadSuccess(`อัปโหลดสำเร็จ: โหลด ${parsed.length} แท่งเทียน (Timeframe: ${tf}, ข้อมูลล่าสุด: ${lastDate})`);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการประมวลผล CSV';
        setCsvUploadError(msg);
      }
    };
    reader.onerror = () => {
      setCsvUploadError('ไม่สามารถอ่านไฟล์ได้');
    };
    reader.readAsText(file);
  };

  const handleClearCSV = () => {
    if (confirm(`คุณต้องการลบข้อมูล CSV ของ ${selectedSymbol} หรือไม่?`)) {
      setStoredCandles(selectedSymbol, []);
      setCandles([]);
      setAssets(prev => prev.map(a => {
        if (a.symbol === selectedSymbol) {
          return {
            ...a,
            price: undefined,
            changeVsPrevCandle: undefined,
            change24h: undefined,
            lastCandleDate: undefined,
            dataSource: null,
            csvTimeframe: undefined,
          };
        }
        return a;
      }));
      setCsvUploadSuccess(null);
      setCsvUploadError(null);
    }
  };

  // Alert Handlers
  const handleSaveAlert = (newAlertData: Omit<PriceAlert, 'id' | 'createdAt' | 'status'>) => {
    const alert: PriceAlert = {
      ...newAlertData,
      id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: Date.now(),
      status: 'active',
      armed: true,
    };
    setAlerts(prev => [alert, ...prev]);
  };

  const handleQuickAddAlert = (price: number) => {
    setPrefilledAlertPrice(price);
    setIsAlertModalOpen(true);
  };

  const handleToggleAlert = (id: string) => {
    setAlerts(prev => prev.map(a => {
      if (a.id === id) {
        return {
          ...a,
          status: a.status === 'active' ? 'disabled' : 'active',
          armed: a.status !== 'active',
        };
      }
      return a;
    }));
  };

  const handleDeleteAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const handleReArmAlert = (id: string) => {
    setAlerts(prev => prev.map(a => {
      if (a.id === id) {
        return {
          ...a,
          status: 'active',
          armed: true,
          triggeredAt: undefined,
        };
      }
      return a;
    }));
  };

  const activeAlertCount = alerts.filter(a => a.status === 'active').length;
  const currentSymbolAlerts = alerts.filter(a => a.symbol === selectedSymbol && a.status === 'active');
  const hasRealPrice = currentAsset.price !== undefined && currentAsset.price !== null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 3-Zone Top Bar */}
      <TopNav
        activeView={activeView}
        setActiveView={setActiveView}
        activeAlertCount={activeAlertCount}
        onOpenAlertDrawer={() => setIsAlertDrawerOpen(true)}
        soundEnabled={soundEnabled}
        onToggleSound={() => {
          const next = !soundEnabled;
          setSoundEnabled(next);
          soundService.enabled = next;
        }}
        onOpenCreateAlert={() => {
          setPrefilledAlertPrice(null);
          setIsAlertModalOpen(true);
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1720px] w-full mx-auto p-3 lg:p-4 space-y-3">
        {/* Asset Selector Strip */}
        <AssetSelector
          assets={assets}
          selectedSymbol={selectedSymbol}
          onSelectSymbol={setSelectedSymbol}
          alerts={alerts}
          onUploadClick={(sym) => {
            setSelectedSymbol(sym);
            if (fileInputRef.current) fileInputRef.current.click();
          }}
        />

        {activeView === 'calculator' ? (
          <RiskCalculator assets={assets} currentAsset={currentAsset} />
        ) : activeView === 'analysis' ? (
          <MarketAnalysisView
            assets={assets}
            selectedSymbol={selectedSymbol}
            onSelectSymbol={setSelectedSymbol}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-[580px]">
            {/* Interactive Trading Chart (9 Cols on desktop) */}
            <div className="lg:col-span-9 h-[580px] lg:h-auto min-h-[520px]">
              {candles.length > 0 ? (
                <TradingChart
                  candles={displayedCandles}
                  symbol={selectedSymbol}
                  decimals={currentAsset.decimals}
                  timeframe={timeframe}
                  onTimeframeChange={setTimeframe}
                  alerts={alerts}
                  currentPrice={currentAsset.price ?? 0}
                  onQuickAddAlert={handleQuickAddAlert}
                  onOpenAlertModal={() => {
                    setPrefilledAlertPrice(null);
                    setIsAlertModalOpen(true);
                  }}
                  isLive={isLiveWs}
                  isTimeframeDisabled={!isBinanceAsset}
                  isWeeklyView={isWeeklyView}
                  onToggleWeeklyView={() => setIsWeeklyView(v => !v)}
                  canToggleWeeklyView={isCsvDaily}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full min-h-[500px] bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-amber-400 mb-4 shadow-lg">
                    <FileSpreadsheet className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-1">
                    ยังไม่มีข้อมูลราคาสำหรับ {currentAsset.symbol} ({currentAsset.thaiName})
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
                    แอปพลิเคชันจะไม่สร้างข้อมูลสุ่มหรือข้อมูลจำลอง กรุณาอัปโหลดไฟล์ CSV ที่ส่งออกจาก TradingView เพื่อเริ่มดูกราฟวิเคราะห์และตั้งแจ้งเตือนราคา
                  </p>

                  <label className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer transition-all">
                    <UploadCloud className="w-4 h-4" />
                    <span>อัปโหลดไฟล์ CSV (TradingView)</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  <div className="mt-4 text-[11px] text-slate-400 font-mono">
                    คอลัมน์ที่รองรับ: time, open, high, low, close, volume
                  </div>
                </div>
              )}
            </div>

            {/* Right Information & Data Source / CSV Management Panel (3 Cols) */}
            <div className="lg:col-span-3 space-y-3 flex flex-col">
              {/* Asset Header & Real Price Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{currentAsset.icon}</span>
                      <div>
                        <h2 className="text-base font-bold text-white">{currentAsset.symbol}</h2>
                        <span className="text-xs text-slate-400">{currentAsset.name} · {currentAsset.thaiName}</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {currentAsset.unit}
                  </span>
                </div>

                {/* Price Display */}
                <div className="pt-2 border-t border-slate-800/80">
                  {hasRealPrice ? (
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-mono font-bold text-white">
                          ${currentAsset.price!.toLocaleString(undefined, { minimumFractionDigits: currentAsset.decimals })}
                        </span>
                        {(currentAsset.changeVsPrevCandle !== undefined || currentAsset.change24h !== undefined) && (
                          <span
                            className={`text-xs font-mono font-bold ${
                              (currentAsset.changeVsPrevCandle ?? currentAsset.change24h ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                            title="change vs previous candle"
                          >
                            {(currentAsset.changeVsPrevCandle ?? currentAsset.change24h ?? 0) >= 0 ? '+' : ''}
                            {(currentAsset.changeVsPrevCandle ?? currentAsset.change24h ?? 0).toFixed(2)}%
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-sans mt-0.5">
                        change vs previous candle
                      </div>
                      {/* Required Data as of label with detected CSV timeframe */}
                      <div className="text-[11px] text-slate-400 font-sans mt-1">
                        Data as of {currentAsset.lastCandleDate || 'Live'}
                        {currentAsset.dataSource === 'CSV Upload' && currentAsset.csvTimeframe ? ` (TF: ${currentAsset.csvTimeframe})` : ''}
                        {' — Source: '}{currentAsset.dataSource || 'Binance'}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="text-sm font-semibold text-amber-400 block">
                        ยังไม่มีข้อมูล — อัปโหลด CSV
                      </span>
                      <div className="text-[11px] text-slate-400 font-sans mt-1">
                        Data as of -- — Source: CSV upload
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Data Source Management Card (CSV Upload) */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-200">
                    <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                    <span>แหล่งข้อมูลราคา (Data Source)</span>
                  </div>
                  {isBinanceAsset ? (
                    <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      Binance Live
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-amber-400">
                      CSV Upload
                    </span>
                  )}
                </div>

                {isBinanceAsset ? (
                  <div className="text-xs text-slate-400 space-y-2">
                    <p className="leading-relaxed">
                      สินทรัพย์นี้ดึงข้อมูลแท่งเทียนจริงจาก Binance REST API และรับราคาแบบเรียลไทม์ผ่าน Binance WebSocket
                    </p>
                    <div className="text-[11px] text-slate-400 bg-slate-950 p-2 rounded-lg border border-slate-800">
                      สถานะ WebSocket: {isLiveWs ? <span className="text-emerald-400 font-semibold">กำลังเชื่อมต่อ (Connected)</span> : <span className="text-slate-400">รอการเชื่อมต่อ</span>}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      สำหรับ {currentAsset.name} ({currentAsset.symbol}) รองรับการอัปโหลดไฟล์ประวัติราคาจาก TradingView CSV:
                    </p>

                    {/* File Upload Trigger */}
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="csv-file-input"
                      />
                      <label
                        htmlFor="csv-file-input"
                        className="w-full py-2.5 px-3 rounded-xl border border-dashed border-slate-700 hover:border-amber-500 bg-slate-950/60 hover:bg-slate-950 flex items-center justify-center gap-2 text-xs font-semibold text-slate-300 hover:text-amber-400 cursor-pointer transition-colors"
                      >
                        <UploadCloud className="w-4 h-4 text-amber-400" />
                        <span>เลือกไฟล์ CSV เพื่ออัปโหลด</span>
                      </label>
                    </div>

                    {/* Upload feedback */}
                    {csvUploadSuccess && (
                      <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-[11px] text-emerald-400 flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{csvUploadSuccess}</span>
                      </div>
                    )}

                    {csvUploadError && (
                      <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-[11px] text-rose-400 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{csvUploadError}</span>
                      </div>
                    )}

                    {candles.length > 0 && (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-slate-400 font-mono">
                          บันทึกแล้ว: {candles.length} แท่ง
                        </span>
                        <button
                          onClick={handleClearCSV}
                          className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>ลบข้อมูล CSV</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Price Alerts Summary for this Asset */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 flex-1">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="font-bold text-xs text-slate-200">
                    การแจ้งเตือนราคาของ {currentAsset.symbol} ({currentSymbolAlerts.length})
                  </span>
                  <button
                    onClick={() => {
                      setPrefilledAlertPrice(null);
                      setIsAlertModalOpen(true);
                    }}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                  >
                    + ตั้งเตือน
                  </button>
                </div>

                {currentSymbolAlerts.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs">
                    ยังไม่มีการตั้งเตือนสำหรับสินทรัพย์นี้
                  </div>
                ) : (
                  <div className="space-y-2">
                    {currentSymbolAlerts.map(alert => (
                      <div key={alert.id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-mono font-bold text-white">
                            {alert.condition === 'gte' ? '≥' : '≤'} ${alert.targetPrice.toLocaleString(undefined, { minimumFractionDigits: currentAsset.decimals })}
                          </div>
                          {alert.note && <div className="text-[10px] text-amber-400/80">{alert.note}</div>}
                        </div>
                        <button
                          onClick={() => handleDeleteAlert(alert.id)}
                          className="text-slate-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Price Alert Creation Modal */}
      <AlertModal
        isOpen={isAlertModalOpen}
        onClose={() => {
          setIsAlertModalOpen(false);
          setPrefilledAlertPrice(null);
        }}
        asset={currentAsset}
        prefilledPrice={prefilledAlertPrice}
        onSaveAlert={handleSaveAlert}
      />

      {/* Price Alert Drawer / Manager */}
      <AlertDrawer
        isOpen={isAlertDrawerOpen}
        onClose={() => setIsAlertDrawerOpen(false)}
        alerts={alerts}
        assets={assets}
        onToggleAlert={handleToggleAlert}
        onDeleteAlert={handleDeleteAlert}
        onReArmAlert={handleReArmAlert}
        onOpenCreateModal={() => {
          setIsAlertDrawerOpen(false);
          setPrefilledAlertPrice(null);
          setIsAlertModalOpen(true);
        }}
      />

      {/* Floating Alert Triggered Toast */}
      <AlertNotificationToast
        alert={activeAlertToast}
        asset={assets.find(a => a.symbol === activeAlertToast?.symbol)}
        onDismiss={() => setActiveAlertToast(null)}
        onSelectAsset={(sym) => {
          setSelectedSymbol(sym);
          setActiveAlertToast(null);
        }}
      />
    </div>
  );
}
