import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Asset, 
  Candle, 
  PriceAlert, 
  Timeframe 
} from './types/trading';
import { 
  INITIAL_ASSETS, 
  fetchSilverKlines,
  parseTradingViewCSV, 
  getStoredCandles, 
  setStoredCandles,
  detectCandleTimeframe,
  aggregateDailyToWeekly,
} from './services/marketData';
import {
  fetchKrakenKlines,
  subscribeKrakenOhlc,
  migrateUsdtToUsdStorage,
} from './services/krakenData';
import { soundService } from './services/sound';
import { TopNav } from './components/TopNav';
import { AssetSelector } from './components/AssetSelector';
import { TradingChart } from './components/TradingChart';
import { AlertModal } from './components/AlertModal';
import { AlertDrawer } from './components/AlertDrawer';
import { AlertNotificationToast } from './components/AlertNotificationToast';
import { RiskCalculator } from './components/RiskCalculator';
import { MarketAnalysisView } from './components/MarketAnalysisView';
import { BreakoutScalpView } from './components/BreakoutScalpView';
import { SCALP_ASSETS, loadScalpConfigs, filterClosedCandles } from './services/breakoutScalp';
import { UploadCloud, FileSpreadsheet, Trash2, CheckCircle, AlertCircle, Sparkles, X } from 'lucide-react';

const ALERTS_STORAGE_KEY = 'apextrade_alerts_v2';
const APP_MODE_STORAGE_KEY = 'apextrade_app_mode';

function isKrakenSymbol(symbol: string): boolean {
  return symbol === 'BTC/USD' || symbol === 'ETH/USD' || symbol === 'SOL/USD';
}

function isYahooSymbol(symbol: string): boolean {
  return symbol === 'XAG/USD' || symbol === 'SI1!' || symbol === 'XAU/USD' || symbol === 'GC1!';
}

function isGoldSymbol(symbol: string): boolean {
  return symbol === 'XAU/USD' || symbol === 'GC1!';
}

function formatCandleDate(timestampSec: number): string {
  const d = new Date(timestampSec * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

// Run one-time USDT -> USD localStorage migration before initializing state
migrateUsdtToUsdStorage();

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

  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC/USD');
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isLiveWs, setIsLiveWs] = useState<boolean>(false);
  const [yahooConnStatus, setYahooConnStatus] = useState<'loading' | 'connected' | 'error'>('loading');
  const [csvUploadError, setCsvUploadError] = useState<string | null>(null);
  const [csvUploadSuccess, setCsvUploadSuccess] = useState<string | null>(null);
  const [isWeeklyView, setIsWeeklyView] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeChartKeyRef = useRef<string>(`${selectedSymbol}|${timeframe}`);
  const lastChecked1mCandleTimeRef = useRef<Record<string, number>>({});

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

  // Mode selection state (Mode 1: original, Mode 2: Breakout Scalp)
  const [appMode, setAppMode] = useState<'mode1' | 'mode2'>(() => {
    try {
      const saved = localStorage.getItem(APP_MODE_STORAGE_KEY);
      if (saved === 'mode2') return 'mode2';
    } catch {}
    return 'mode1';
  });

  useEffect(() => {
    try {
      localStorage.setItem(APP_MODE_STORAGE_KEY, appMode);
    } catch {}
  }, [appMode]);

  // Breakout Scalp background alert state
  const [scalpToast, setScalpToast] = useState<{ symbol: string; message: string; time: number } | null>(null);
  const lastAlertedScalpCandlesRef = useRef<Record<string, number>>({});

  // Background monitor: Check Breakout Scalp alerts across all enabled assets (works in both Mode 1 & 2)
  useEffect(() => {
    const checkScalpAlerts = async () => {
      const configs = loadScalpConfigs();
      for (const assetMeta of SCALP_ASSETS) {
        const conf = configs[assetMeta.symbol];
        if (!conf || !conf.alertEnabled) continue;
        if (conf.levelHigh === null && conf.levelLow === null) continue;

        try {
          let klines: Candle[] = [];
          if (assetMeta.source === 'Kraken') {
            klines = await fetchKrakenKlines(assetMeta.symbol, conf.timeframe as Timeframe);
          } else {
            const res = await fetch(`/api/klines?symbol=${encodeURIComponent(assetMeta.symbol)}&timeframe=${conf.timeframe}`);
            const data = await res.json();
            klines = data.candles || [];
          }

          const tfSec = conf.timeframe === '1m' ? 60 : 300;
          const closed = filterClosedCandles(klines, tfSec);
          if (closed.length < 26) continue;

          const latestClosed = closed[closed.length - 1];
          // Alert only once per candle
          if (lastAlertedScalpCandlesRef.current[assetMeta.symbol] === latestClosed.time) {
            continue;
          }

          const prior20 = closed.slice(-21, -1);
          const avgVol20 = prior20.reduce((s, c) => s + (c.volume || 0), 0) / 20;
          const volRatio = avgVol20 > 0 ? (latestClosed.volume || 0) / avgVol20 : 0;
          if (volRatio < 2.0) continue;

          const prior5 = closed.slice(-6, -1);
          const maxHigh5 = Math.max(...prior5.map(c => c.high));
          const minLow5 = Math.min(...prior5.map(c => c.low));

          let triggeredSide: 'bull' | 'bear' | null = null;
          if (conf.levelHigh !== null && latestClosed.close > conf.levelHigh && latestClosed.close > maxHigh5) {
            triggeredSide = 'bull';
          } else if (conf.levelLow !== null && latestClosed.close < conf.levelLow && latestClosed.close < minLow5) {
            triggeredSide = 'bear';
          }

          if (triggeredSide) {
            lastAlertedScalpCandlesRef.current[assetMeta.symbol] = latestClosed.time;
            const timeHHMM = new Date(latestClosed.time * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            const dir = triggeredSide === 'bull' ? 'เหนือ' : 'ใต้';
            const lvl = triggeredSide === 'bull' ? conf.levelHigh : conf.levelLow;
            const msg = `[FACT] แท่ง ${timeHHMM} ปิด ${latestClosed.close.toFixed(conf.decimals)} ${dir}เส้น ${lvl?.toFixed(conf.decimals)} · vol ${volRatio.toFixed(1)}× เฉลี่ย 20 → [INFERENCE] เข้าเงื่อนไข trigger (ข้อ 4)`;

            if (soundService.enabled) {
              soundService.playPriceAlertSound();
            }

            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification(`⚡ Breakout Scalp Trigger: ${assetMeta.symbol}`, {
                  body: msg,
                  icon: '/favicon.ico',
                });
              } catch {}
            }

            setScalpToast({
              symbol: assetMeta.symbol,
              message: msg,
              time: Date.now(),
            });
          }
        } catch {
          // ignore transient poll failure
        }
      }
    };

    const interval = setInterval(checkScalpAlerts, 15000);
    checkScalpAlerts(); // initial run
    return () => clearInterval(interval);
  }, []);

  const currentAsset = assets.find(a => a.symbol === selectedSymbol) || assets[0];
  const isKrakenAsset = isKrakenSymbol(selectedSymbol);
  const isYahooAsset = isYahooSymbol(selectedSymbol);
  const isGoldAsset = isGoldSymbol(selectedSymbol);

  const isCsvDaily = !isKrakenAsset && !isYahooAsset && !!(currentAsset.csvTimeframe?.toLowerCase().includes('d') || currentAsset.csvTimeframe?.toLowerCase().includes('day') || currentAsset.csvTimeframe === '1D' || currentAsset.csvTimeframe === '1d');

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

  // Check alerts against real price update (optionally scoped to 'gte' or 'lte')
  const checkPriceAlerts = useCallback((symbol: string, newPrice: number, onlyCondition?: 'gte' | 'lte') => {
    setAlerts(prevAlerts => {
      let triggeredOne: PriceAlert | null = null;

      const updated = prevAlerts.map(alert => {
        if (alert.symbol !== symbol) {
          return alert;
        }
        if (onlyCondition && alert.condition !== onlyCondition) {
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

  const alertsRef = useRef<PriceAlert[]>(alerts);
  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  const selectedSymbolRef = useRef<string>(selectedSymbol);
  useEffect(() => {
    selectedSymbolRef.current = selectedSymbol;
    delete lastChecked1mCandleTimeRef.current[selectedSymbol];
  }, [selectedSymbol]);

  // Background 15s price alert checker for all non-selected assets with active alerts (Kraken & Yahoo only)
  useEffect(() => {
    const checkBackgroundPriceAlerts = async () => {
      const currentAlerts = alertsRef.current;
      const activeSymbols = new Set<string>();

      for (const a of currentAlerts) {
        if (a.status !== 'active') continue;
        if (a.symbol === selectedSymbolRef.current) continue;
        if (!isKrakenSymbol(a.symbol) && !isYahooSymbol(a.symbol)) continue;
        activeSymbols.add(a.symbol);
      }

      for (const sym of activeSymbols) {
        try {
          let klines: Candle[] = [];
          if (isKrakenSymbol(sym)) {
            klines = await fetchKrakenKlines(sym, '1m');
          } else if (isYahooSymbol(sym)) {
            const res = await fetch(`/api/klines?symbol=${encodeURIComponent(sym)}&timeframe=1m`);
            if (!res.ok) continue;
            const data = await res.json();
            klines = Array.isArray(data.candles) ? data.candles : [];
          }

          const closed1m = filterClosedCandles(klines, 60).sort((a, b) => a.time - b.time);
          if (closed1m.length === 0) continue;

          const prevCheckedTime = lastChecked1mCandleTimeRef.current[sym];
          const candlesToCheck =
            prevCheckedTime === undefined
              ? [closed1m[closed1m.length - 1]]
              : closed1m.filter(c => c.time > prevCheckedTime);

          if (candlesToCheck.length === 0) continue;

          lastChecked1mCandleTimeRef.current[sym] = candlesToCheck[candlesToCheck.length - 1].time;

          const symAlerts = alertsRef.current.filter(a => a.symbol === sym && a.status === 'active');
          const hasGte = symAlerts.some(a => a.condition === 'gte');
          const hasLte = symAlerts.some(a => a.condition === 'lte');

          for (const c of candlesToCheck) {
            if (hasGte) checkPriceAlerts(sym, c.high, 'gte');
            if (hasLte) checkPriceAlerts(sym, c.low, 'lte');
          }
        } catch {
          // ignore transient poll failure
        }
      }
    };

    const interval = setInterval(checkBackgroundPriceAlerts, 15000);
    checkBackgroundPriceAlerts();
    return () => clearInterval(interval);
  }, [checkPriceAlerts]);

  // Load candle data for current selected asset
  useEffect(() => {
    setCsvUploadError(null);
    setCsvUploadSuccess(null);

    const chartKey = `${selectedSymbol}|${timeframe}`;
    activeChartKeyRef.current = chartKey;
    setCandles([]);

    if (isKrakenAsset) {
      // Load real klines from Kraken REST API for BTC, ETH, or SOL
      let isMounted = true;
      fetchKrakenKlines(selectedSymbol, timeframe)
        .then(klineCandles => {
          if (!isMounted || activeChartKeyRef.current !== chartKey) return;
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
                  dataSource: 'Kraken',
                };
              }
              return a;
            }));

            // Check alerts on initial klines load
            checkPriceAlerts(selectedSymbol, last.close);
          }
        })
        .catch(err => {
          console.warn('Kraken klines fetch failed:', err);
        });

      return () => {
        isMounted = false;
      };
    } else if (isYahooAsset) {
      // Load real klines and price for Silver/Gold via backend Yahoo Finance proxy
      let isMounted = true;
      setYahooConnStatus('loading');
      setIsLiveWs(false);

      const loadYahoo = () => {
        fetchSilverKlines(selectedSymbol, timeframe)
          .then(({ candles: yahooCandles, source, price }) => {
            if (!isMounted || activeChartKeyRef.current !== chartKey) return;
            if (yahooCandles.length > 0) {
              setYahooConnStatus('connected');
              setIsLiveWs(true);
              setCandles(yahooCandles);
              const last = yahooCandles[yahooCandles.length - 1];
              const prev = yahooCandles.length > 1 ? yahooCandles[yahooCandles.length - 2] : last;
              const change = prev.close > 0 ? ((price - prev.close) / prev.close) * 100 : 0;
              const lastDate = formatCandleDate(last.time);

              setAssets(prev => prev.map(a => {
                if (a.symbol === selectedSymbol) {
                  return {
                    ...a,
                    price,
                    changeVsPrevCandle: Number(change.toFixed(2)),
                    lastCandleDate: lastDate,
                    dataSource: source,
                  };
                }
                return a;
              }));

              checkPriceAlerts(selectedSymbol, price);
            } else {
              setYahooConnStatus('error');
              setIsLiveWs(false);
            }
          })
          .catch(err => {
            if (!isMounted || activeChartKeyRef.current !== chartKey) return;
            console.warn('Yahoo klines fetch failed:', err);
            setYahooConnStatus('error');
            setIsLiveWs(false);
          });
      };

      loadYahoo();
      const intervalId = setInterval(loadYahoo, 30000);

      return () => {
        isMounted = false;
        clearInterval(intervalId);
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
  }, [selectedSymbol, timeframe, isKrakenAsset, isYahooAsset, checkPriceAlerts]);

  const candlesRef = useRef<Candle[]>(candles);
  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  // Live Kraken WebSocket v2 OHLC stream for BTC/USD, ETH/USD, and SOL/USD
  useEffect(() => {
    if (!isKrakenAsset || typeof window === 'undefined') {
      if (!isYahooAsset) setIsLiveWs(false);
      return;
    }

    const wsKey = `${selectedSymbol}|${timeframe}`;
    const wsSymbol = selectedSymbol;
    let isDisposed = false;
    let latestSnapshotCandle: Candle | null = null;
    let snapshotFlushScheduled = false;

    const updateAssetFromCandle = (candle: Candle) => {
      const currentCandles = candlesRef.current;
      if (currentCandles.length === 0) return;

      const lastIdx = currentCandles.length - 1;
      const lastCandle = currentCandles[lastIdx];
      if (candle.time < lastCandle.time) return;

      const isSameAsLast = lastCandle.time === candle.time;
      let changePct = 0;
      if (isSameAsLast) {
        if (currentCandles.length > 1) {
          const prevC = currentCandles[currentCandles.length - 2];
          changePct = prevC.close > 0 ? ((candle.close - prevC.close) / prevC.close) * 100 : 0;
        } else {
          changePct = candle.open > 0 ? ((candle.close - candle.open) / candle.open) * 100 : 0;
        }
      } else {
        changePct = lastCandle.close > 0 ? ((candle.close - lastCandle.close) / lastCandle.close) * 100 : 0;
      }

      const formattedDate = formatCandleDate(candle.time);
      setAssets(prevAssets => prevAssets.map(a => {
        if (a.symbol === wsSymbol) {
          return {
            ...a,
            price: candle.close,
            changeVsPrevCandle: Number(changePct.toFixed(2)),
            lastCandleDate: formattedDate,
            dataSource: 'Kraken',
          };
        }
        return a;
      }));
    };

    const unsubscribe = subscribeKrakenOhlc(
      wsSymbol,
      timeframe,
      (updatedCandle, isSnapshot) => {
        if (isDisposed || activeChartKeyRef.current !== wsKey) return;

        if (isSnapshot) {
          if (!latestSnapshotCandle || updatedCandle.time >= latestSnapshotCandle.time) {
            latestSnapshotCandle = updatedCandle;
          }

          setCandles(prevCandles => {
            if (prevCandles.length === 0) return prevCandles;

            const lastIdx = prevCandles.length - 1;
            const lastCandle = prevCandles[lastIdx];

            if (updatedCandle.time === lastCandle.time) {
              const copy = [...prevCandles];
              copy[lastIdx] = updatedCandle;
              return copy;
            }
            if (updatedCandle.time > lastCandle.time) {
              return [...prevCandles, updatedCandle];
            }

            const matchIdx = prevCandles.findIndex(c => c.time === updatedCandle.time);
            if (matchIdx !== -1) {
              const copy = [...prevCandles];
              copy[matchIdx] = updatedCandle;
              return copy;
            }
            return prevCandles;
          });

          if (!snapshotFlushScheduled) {
            snapshotFlushScheduled = true;
            queueMicrotask(() => {
              snapshotFlushScheduled = false;
              const latest = latestSnapshotCandle;
              latestSnapshotCandle = null;
              if (isDisposed || activeChartKeyRef.current !== wsKey || !latest) return;
              updateAssetFromCandle(latest);
            });
          }
          return;
        }

        // message type === "update"
        checkPriceAlerts(wsSymbol, updatedCandle.close);

        setCandles(prevCandles => {
          if (prevCandles.length === 0) return prevCandles;

          const lastIdx = prevCandles.length - 1;
          const lastCandle = prevCandles[lastIdx];

          if (updatedCandle.time >= lastCandle.time) {
            const isSameAsLast = lastCandle.time === updatedCandle.time;
            let changePct = 0;
            if (isSameAsLast) {
              if (prevCandles.length > 1) {
                const prevC = prevCandles[prevCandles.length - 2];
                changePct = prevC.close > 0 ? ((updatedCandle.close - prevC.close) / prevC.close) * 100 : 0;
              } else {
                changePct = updatedCandle.open > 0 ? ((updatedCandle.close - updatedCandle.open) / updatedCandle.open) * 100 : 0;
              }
            } else {
              changePct = lastCandle.close > 0 ? ((updatedCandle.close - lastCandle.close) / lastCandle.close) * 100 : 0;
            }

            const formattedDate = formatCandleDate(updatedCandle.time);
            setAssets(prevAssets => prevAssets.map(a => {
              if (a.symbol === wsSymbol) {
                return {
                  ...a,
                  price: updatedCandle.close,
                  changeVsPrevCandle: Number(changePct.toFixed(2)),
                  lastCandleDate: formattedDate,
                  dataSource: 'Kraken',
                };
              }
              return a;
            }));

            if (isSameAsLast) {
              const copy = [...prevCandles];
              copy[lastIdx] = updatedCandle;
              return copy;
            }
            return [...prevCandles, updatedCandle];
          }

          const matchIdx = prevCandles.findIndex(c => c.time === updatedCandle.time);
          if (matchIdx !== -1) {
            const copy = [...prevCandles];
            copy[matchIdx] = updatedCandle;
            return copy;
          }
          return prevCandles;
        });
      },
      (connected) => {
        if (!isDisposed && activeChartKeyRef.current === wsKey) {
          setIsLiveWs(connected);
        }
      }
    );

    return () => {
      isDisposed = true;
      unsubscribe();
    };
  }, [selectedSymbol, timeframe, isKrakenAsset, isYahooAsset, checkPriceAlerts]);

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
        setActiveView={(v) => {
          setActiveView(v);
          setAppMode('mode1');
        }}
        activeAlertCount={activeAlertCount}
        onOpenAlertDrawer={() => {
          setAppMode('mode1');
          setIsAlertDrawerOpen(true);
        }}
        soundEnabled={soundEnabled}
        onToggleSound={() => {
          const next = !soundEnabled;
          setSoundEnabled(next);
          soundService.enabled = next;
        }}
        onOpenCreateAlert={() => {
          setAppMode('mode1');
          setPrefilledAlertPrice(null);
          setIsAlertModalOpen(true);
        }}
      />

      {/* Mode Switcher Buttons - Full Width below TopNav */}
      <div className="w-full bg-slate-950/95 border-b border-slate-800 px-3 lg:px-6 py-2.5 sticky top-[57px] z-30 backdrop-blur-md">
        <div className="max-w-[1720px] w-full mx-auto grid grid-cols-2 gap-3">
          <button
            onClick={() => setAppMode('mode1')}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              appMode === 'mode1'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <span>แบบที่ 1 · เดิม</span>
          </button>
          <button
            onClick={() => setAppMode('mode2')}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              appMode === 'mode2'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <span>แบบที่ 2 · Breakout Scalp</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1720px] w-full mx-auto p-3 lg:p-4 space-y-3">
        {appMode === 'mode2' ? (
          <BreakoutScalpView />
        ) : (
          <>
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
              {(candles.length > 0 || isKrakenAsset || isYahooAsset) ? (
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
                  isTimeframeDisabled={!isKrakenAsset && !isYahooAsset}
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
                        {' — Source: '}{currentAsset.dataSource || 'Kraken'}
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
                  {isKrakenAsset ? (
                    <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      Kraken Live
                    </span>
                  ) : isYahooAsset ? (
                    <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Yahoo Finance (COMEX)
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-amber-400">
                      CSV Upload
                    </span>
                  )}
                </div>

                {isKrakenAsset ? (
                  <div className="text-xs text-slate-400 space-y-2">
                    <p className="leading-relaxed">
                      สินทรัพย์นี้ดึงข้อมูลแท่งเทียนจริงจาก Kraken REST API และรับราคาแบบเรียลไทม์ผ่าน Kraken WebSocket
                    </p>
                    <div className="text-[11px] text-slate-400 bg-slate-950 p-2 rounded-lg border border-slate-800">
                      สถานะ WebSocket: {isLiveWs ? <span className="text-emerald-400 font-semibold">กำลังเชื่อมต่อ (Connected)</span> : <span className="text-slate-400">รอการเชื่อมต่อ</span>}
                    </div>
                  </div>
                ) : isYahooAsset ? (
                  <div className="text-xs text-slate-400 space-y-2">
                    <p className="leading-relaxed">
                      ดึงข้อมูลราคา {isGoldAsset ? 'COMEX Gold Futures' : 'COMEX Silver Futures'} (<span className="text-slate-200 font-mono">{isGoldAsset ? 'GC=F' : 'SI=F'}</span>) อัตโนมัติจาก Yahoo Finance แบบ Real-time ไม่ต้องอัปโหลด CSV
                    </p>
                    <div className="text-[11px] text-slate-400 bg-slate-950 p-2 rounded-lg border border-slate-800 flex items-center justify-between gap-2">
                      <span className="shrink-0">สถานะการเชื่อมต่อ:</span>
                      {yahooConnStatus === 'connected' ? (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          เชื่อมต่อแล้ว (อัปเดตทุก 30 วินาที)
                        </span>
                      ) : yahooConnStatus === 'error' ? (
                        <span className="text-rose-400 font-semibold flex items-center gap-1 text-right">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0"></span>
                          ดึงข้อมูลไม่สำเร็จ — ลองใหม่อัตโนมัติใน 30 วิ
                        </span>
                      ) : (
                        <span className="text-slate-400 font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse"></span>
                          กำลังเชื่อมต่อ...
                        </span>
                      )}
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
          </>
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

      {/* Floating Breakout Scalp Trigger Toast */}
      {scalpToast && (
        <div className="fixed top-5 right-5 z-50 max-w-md w-full bg-slate-900 border-2 border-emerald-500 rounded-2xl shadow-2xl shadow-emerald-500/20 overflow-hidden p-4 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span>⚡ แจ้งเตือน Breakout Scalp ({scalpToast.symbol})</span>
            </div>
            <button
              onClick={() => setScalpToast(null)}
              className="text-slate-400 hover:text-white rounded p-1 hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-2 text-slate-200 font-mono text-[11px] leading-relaxed bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
            {scalpToast.message}
          </p>
          <div className="mt-3 flex items-center justify-end gap-2 text-xs">
            <button
              onClick={() => {
                setAppMode('mode2');
                setScalpToast(null);
              }}
              className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-md transition-all cursor-pointer"
            >
              เปิดโหมด Breakout Scalp
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
