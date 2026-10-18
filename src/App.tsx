import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Asset, 
  Candle, 
  PaperAccount, 
  Position, 
  PriceAlert, 
  Timeframe, 
  TradeTick 
} from './types/trading';
import { 
  INITIAL_ASSETS, 
  generateCandleHistory, 
  TIMEFRAME_SECONDS 
} from './services/marketData';
import { soundService } from './services/sound';
import { TopNav } from './components/TopNav';
import { AssetSelector } from './components/AssetSelector';
import { TradingChart } from './components/TradingChart';
import { OrderBook } from './components/OrderBook';
import { TradeExecution } from './components/TradeExecution';
import { PositionsPanel } from './components/PositionsPanel';
import { AlertModal } from './components/AlertModal';
import { AlertDrawer } from './components/AlertDrawer';
import { AlertNotificationToast } from './components/AlertNotificationToast';
import { RiskCalculator } from './components/RiskCalculator';

const ALERTS_STORAGE_KEY = 'apextrade_alerts_v1';
const ACCOUNT_STORAGE_KEY = 'apextrade_account_v1';
const POSITIONS_STORAGE_KEY = 'apextrade_positions_v1';

export default function App() {
  // Navigation View
  const [activeView, setActiveView] = useState<'trade' | 'alerts' | 'portfolio' | 'calculator'>('trade');

  // Market & Asset State
  const [assets, setAssets] = useState<Asset[]>(INITIAL_ASSETS);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC/USDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [recentTrades, setRecentTrades] = useState<TradeTick[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isLiveWs, setIsLiveWs] = useState<boolean>(false);

  // Price Alerts State
  const [alerts, setAlerts] = useState<PriceAlert[]>(() => {
    try {
      const saved = localStorage.getItem(ALERTS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    // Default sample alert for demonstration: BTC and Gold alerts
    return [
      {
        id: 'alert-btc-default',
        symbol: 'BTC/USDT',
        targetPrice: 68500,
        condition: 'gte',
        initialPrice: 67845.50,
        createdAt: Date.now() - 3600000,
        status: 'active',
        note: 'แนวต้านสำคัญ $68,500 ทะลุเข้าซื้อตาม',
        soundEnabled: true,
        recurring: false,
      },
      {
        id: 'alert-gold-default',
        symbol: 'XAU/USD',
        targetPrice: 2740,
        condition: 'gte',
        initialPrice: 2724.85,
        createdAt: Date.now() - 7200000,
        status: 'active',
        note: 'ทองคำทดสอบ New High',
        soundEnabled: true,
        recurring: false,
      },
    ];
  });

  const [activeAlertToast, setActiveAlertToast] = useState<PriceAlert | null>(null);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState<boolean>(false);
  const [prefilledAlertPrice, setPrefilledAlertPrice] = useState<number | null>(null);
  const [isAlertDrawerOpen, setIsAlertDrawerOpen] = useState<boolean>(false);

  // Paper Trading & Positions State
  const [account, setAccount] = useState<PaperAccount>(() => {
    try {
      const saved = localStorage.getItem(ACCOUNT_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      balance: 50000.0,
      equity: 50000.0,
      marginUsed: 0.0,
      freeMargin: 50000.0,
      realizedPnl: 0.0,
    };
  });

  const [positions, setPositions] = useState<Position[]>(() => {
    try {
      const saved = localStorage.getItem(POSITIONS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  // Current active asset object
  const currentAsset = assets.find(a => a.symbol === selectedSymbol) || assets[0];

  // Save alerts to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
    } catch {}
  }, [alerts]);

  // Save account & positions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
      localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(positions));
    } catch {}
  }, [account, positions]);

  // Load candle history when selectedSymbol or timeframe changes
  useEffect(() => {
    const history = generateCandleHistory(currentAsset.price, timeframe, 80);
    setCandles(history);

    // Initial recent trades
    const initialTrades: TradeTick[] = [];
    const step = currentAsset.price * 0.0003;
    for (let i = 0; i < 6; i++) {
      initialTrades.push({
        id: `init-${i}`,
        price: currentAsset.price + (Math.random() - 0.5) * step * 3,
        amount: Number(((Math.random() * 2 + 0.1) * (currentAsset.price > 1000 ? 0.3 : 15)).toFixed(2)),
        time: Date.now() - (i * 4000),
        side: Math.random() > 0.5 ? 'buy' : 'sell',
      });
    }
    setRecentTrades(initialTrades);
  }, [selectedSymbol, timeframe]);

  // Real-time Market Tick Engine & Price Alert Checking
  const checkPriceAlerts = useCallback((symbol: string, newPrice: number) => {
    setAlerts(prevAlerts => {
      let triggeredOne: PriceAlert | null = null;

      const updated = prevAlerts.map(alert => {
        if (alert.symbol !== symbol || alert.status !== 'active') {
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
            triggeredAt: Date.now(),
          };

          // Play Sound
          if (alert.soundEnabled && soundService.enabled) {
            soundService.playPriceAlertSound();
          }

          // Browser Notification
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(`🔔 แจ้งเตือนราคา: ${alert.symbol}`, {
                body: `ราคาถึงเป้าหมาย $${alert.targetPrice} แล้ว (ราคาปัจจุบัน $${newPrice.toFixed(2)}) ${alert.note ? `- ${alert.note}` : ''}`,
                icon: '/favicon.ico',
              });
            } catch {}
          }

          return {
            ...alert,
            status: nextStatus,
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

  // Update position TP/SL triggers and floating PnL
  const checkPositionTriggers = useCallback((symbol: string, newPrice: number) => {
    setPositions(prevPositions => {
      return prevPositions.filter(pos => {
        if (pos.symbol !== symbol) return true;

        const isBuy = pos.side === 'buy';
        let shouldClose = false;
        let closeReason = '';

        if (pos.takeProfit) {
          if ((isBuy && newPrice >= pos.takeProfit) || (!isBuy && newPrice <= pos.takeProfit)) {
            shouldClose = true;
            closeReason = 'Take Profit';
          }
        }
        if (pos.stopLoss) {
          if ((isBuy && newPrice <= pos.stopLoss) || (!isBuy && newPrice >= pos.stopLoss)) {
            shouldClose = true;
            closeReason = 'Stop Loss';
          }
        }

        if (shouldClose) {
          const delta = isBuy ? (newPrice - pos.entryPrice) : (pos.entryPrice - newPrice);
          const pnl = (delta / pos.entryPrice) * pos.margin * pos.leverage;

          // Credit account
          setAccount(acc => ({
            ...acc,
            balance: acc.balance + pos.margin + pnl,
            equity: acc.equity + pnl,
            marginUsed: Math.max(0, acc.marginUsed - pos.margin),
            freeMargin: acc.freeMargin + pos.margin + pnl,
            realizedPnl: acc.realizedPnl + pnl,
          }));

          soundService.playOrderFilledSound();
          return false;
        }

        return true;
      });
    });
  }, []);

  // High-frequency Real-time Tick Loop
  useEffect(() => {
    const tickInterval = setInterval(() => {
      setAssets(prevAssets => {
        return prevAssets.map(asset => {
          // Dynamic realistic micro-tick
          const volFactor = asset.price < 50 ? 0.0006 : asset.price < 1000 ? 0.0004 : 0.0003;
          const deltaPct = (Math.random() - 0.495) * volFactor;
          const newPrice = Number(Math.max(0.01, asset.price * (1 + deltaPct)).toFixed(asset.decimals));

          // Check alerts and TP/SL for this asset
          checkPriceAlerts(asset.symbol, newPrice);
          checkPositionTriggers(asset.symbol, newPrice);

          const newHigh = Math.max(asset.high24h, newPrice);
          const newLow = Math.min(asset.low24h, newPrice);

          return {
            ...asset,
            price: newPrice,
            high24h: newHigh,
            low24h: newLow,
          };
        });
      });

      // Update current candle on the active chart
      setCandles(prevCandles => {
        if (prevCandles.length === 0) return prevCandles;
        const last = { ...prevCandles[prevCandles.length - 1] };
        const nowSec = Math.floor(Date.now() / 1000);
        const tfSec = TIMEFRAME_SECONDS[timeframe];

        // Retrieve current updated price for selectedSymbol
        const currentP = currentAsset.price;

        if (nowSec - last.time >= tfSec) {
          // Start new candle
          const newCandle: Candle = {
            time: Math.floor(nowSec / tfSec) * tfSec,
            open: currentP,
            high: currentP,
            low: currentP,
            close: currentP,
            volume: 1,
          };
          return [...prevCandles.slice(1), newCandle];
        } else {
          // Update last candle
          last.close = currentP;
          last.high = Math.max(last.high, currentP);
          last.low = Math.min(last.low, currentP);
          last.volume = Number((last.volume + (Math.random() * 2 + 0.5)).toFixed(1));
          return [...prevCandles.slice(0, prevCandles.length - 1), last];
        }
      });

      // Add a trade tick
      setRecentTrades(prev => {
        const side: 'buy' | 'sell' = Math.random() > 0.5 ? 'buy' : 'sell';
        const tradePrice = currentAsset.price;
        const newTrade: TradeTick = {
          id: `t-${Date.now()}`,
          price: tradePrice,
          amount: Number(((Math.random() * 1.5 + 0.1) * (tradePrice > 1000 ? 0.2 : 20)).toFixed(2)),
          time: Date.now(),
          side,
        };
        return [newTrade, ...prev.slice(0, 19)];
      });

    }, 850);

    return () => clearInterval(tickInterval);
  }, [checkPriceAlerts, checkPositionTriggers, currentAsset.price, currentAsset.decimals, currentAsset.symbol, timeframe]);

  // Recalculate account equity with unrealized PnL of open positions
  useEffect(() => {
    let unrealized = 0;
    positions.forEach(pos => {
      const asset = assets.find(a => a.symbol === pos.symbol);
      const curPrice = asset ? asset.price : pos.entryPrice;
      const isBuy = pos.side === 'buy';
      const delta = isBuy ? (curPrice - pos.entryPrice) : (pos.entryPrice - curPrice);
      unrealized += (delta / pos.entryPrice) * pos.margin * pos.leverage;
    });

    setAccount(acc => ({
      ...acc,
      equity: acc.balance + unrealized,
    }));
  }, [assets, positions]);

  // Public Binance WebSocket for Bitcoin & Ethereum real-time ticks
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let ws: WebSocket | null = null;

    try {
      const streamSymbol = selectedSymbol === 'BTC/USDT' ? 'btcusdt' : selectedSymbol === 'ETH/USDT' ? 'ethusdt' : null;
      if (streamSymbol) {
        ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamSymbol}@trade`);
        ws.onopen = () => {
          setIsLiveWs(true);
        };
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const livePrice = parseFloat(data.p);
            if (!isNaN(livePrice)) {
              setAssets(prev => prev.map(a => {
                if (a.symbol === selectedSymbol) {
                  checkPriceAlerts(a.symbol, livePrice);
                  checkPositionTriggers(a.symbol, livePrice);
                  return { ...a, price: livePrice };
                }
                return a;
              }));
            }
          } catch {}
        };
        ws.onerror = () => {
          setIsLiveWs(false);
        };
        ws.onclose = () => {
          setIsLiveWs(false);
        };
      } else {
        setIsLiveWs(false);
      }
    } catch {
      setIsLiveWs(false);
    }

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [selectedSymbol, checkPriceAlerts, checkPositionTriggers]);

  // Alert Handlers
  const handleSaveAlert = (newAlertData: Omit<PriceAlert, 'id' | 'createdAt' | 'status'>) => {
    const alert: PriceAlert = {
      ...newAlertData,
      id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: Date.now(),
      status: 'active',
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
          triggeredAt: undefined,
        };
      }
      return a;
    }));
  };

  // Trade Position Handlers
  const handleOpenPosition = (newPos: Omit<Position, 'id' | 'openedAt' | 'pnl' | 'pnlPercent'>) => {
    const pos: Position = {
      ...newPos,
      id: `pos-${Date.now()}`,
      openedAt: Date.now(),
      pnl: 0,
      pnlPercent: 0,
    };

    setAccount(acc => ({
      ...acc,
      balance: acc.balance - pos.margin,
      marginUsed: acc.marginUsed + pos.margin,
      freeMargin: acc.freeMargin - pos.margin,
    }));

    setPositions(prev => [pos, ...prev]);
  };

  const handleClosePosition = (id: string) => {
    const pos = positions.find(p => p.id === id);
    if (!pos) return;

    const asset = assets.find(a => a.symbol === pos.symbol);
    const curPrice = asset ? asset.price : pos.entryPrice;
    const isBuy = pos.side === 'buy';
    const delta = isBuy ? (curPrice - pos.entryPrice) : (pos.entryPrice - curPrice);
    const pnl = (delta / pos.entryPrice) * pos.margin * pos.leverage;

    setAccount(acc => ({
      ...acc,
      balance: acc.balance + pos.margin + pnl,
      equity: acc.equity + pnl,
      marginUsed: Math.max(0, acc.marginUsed - pos.margin),
      freeMargin: acc.freeMargin + pos.margin + pnl,
      realizedPnl: acc.realizedPnl + pnl,
    }));

    setPositions(prev => prev.filter(p => p.id !== id));
  };

  const handleResetAccount = () => {
    if (confirm('คุณต้องการรีเซ็ตพอร์ตจำลองเป็น $50,000 USDT และล้างประวัติออเดอร์หรือไม่?')) {
      setPositions([]);
      setAccount({
        balance: 50000.0,
        equity: 50000.0,
        marginUsed: 0.0,
        freeMargin: 50000.0,
        realizedPnl: 0.0,
      });
    }
  };

  const activeAlertCount = alerts.filter(a => a.status === 'active').length;

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
        />

        {activeView === 'calculator' ? (
          <RiskCalculator assets={assets} currentAsset={currentAsset} />
        ) : (
          <>
            {/* Terminal Grid: Left (Chart) | Middle (Order Book) | Right (Trading Panel) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-[580px]">
              {/* Interactive Trading Chart Canvas (7 Cols on desktop) */}
              <div className="lg:col-span-7 h-[560px] lg:h-auto min-h-[500px]">
                <TradingChart
                  candles={candles}
                  symbol={selectedSymbol}
                  decimals={currentAsset.decimals}
                  timeframe={timeframe}
                  onTimeframeChange={setTimeframe}
                  alerts={alerts}
                  currentPrice={currentAsset.price}
                  onQuickAddAlert={handleQuickAddAlert}
                  onOpenAlertModal={() => {
                    setPrefilledAlertPrice(null);
                    setIsAlertModalOpen(true);
                  }}
                  isLive={isLiveWs}
                />
              </div>

              {/* Order Book & Depth (2.5 Cols) */}
              <div className="lg:col-span-2.5 h-[560px] lg:h-auto">
                <OrderBook
                  asset={currentAsset}
                  recentTrades={recentTrades}
                  onSelectPrice={(p) => handleQuickAddAlert(p)}
                />
              </div>

              {/* Trade Execution Panel (2.5 Cols) */}
              <div className="lg:col-span-2.5 h-[560px] lg:h-auto">
                <TradeExecution
                  asset={currentAsset}
                  account={account}
                  onOpenPosition={handleOpenPosition}
                  onSetAlert={(p, n) => {
                    handleSaveAlert({
                      symbol: currentAsset.symbol,
                      targetPrice: p,
                      condition: p >= currentAsset.price ? 'gte' : 'lte',
                      initialPrice: currentAsset.price,
                      note: n,
                      soundEnabled: true,
                      recurring: false,
                    });
                  }}
                />
              </div>
            </div>

            {/* Bottom Positions & Portfolio Panel */}
            <div className="w-full">
              <PositionsPanel
                positions={positions}
                assets={assets}
                account={account}
                onClosePosition={handleClosePosition}
                onResetAccount={handleResetAccount}
              />
            </div>
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
    </div>
  );
}
