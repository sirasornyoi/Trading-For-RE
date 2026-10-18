import React, { useState } from 'react';
import { Asset, PaperAccount, Position } from '../types/trading';
import { ShieldAlert, Zap, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { soundService } from '../services/sound';

interface TradeExecutionProps {
  asset: Asset;
  account: PaperAccount;
  onOpenPosition: (position: Omit<Position, 'id' | 'openedAt' | 'pnl' | 'pnlPercent'>) => void;
  onSetAlert: (price: number, note: string) => void;
}

export const TradeExecution: React.FC<TradeExecutionProps> = ({
  asset,
  account,
  onOpenPosition,
  onSetAlert,
}) => {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [leverage, setLeverage] = useState<number>(10);
  const [marginAmount, setMarginAmount] = useState<string>('500');
  const [limitPrice, setLimitPrice] = useState<string>(asset.price.toString());
  const [takeProfit, setTakeProfit] = useState<string>('');
  const [stopLoss, setStopLoss] = useState<string>('');
  const [autoSetAlerts, setAutoSetAlerts] = useState<boolean>(true);

  const price = orderType === 'market' ? asset.price : (parseFloat(limitPrice) || asset.price);
  const marginNum = parseFloat(marginAmount) || 0;
  const positionSizeUSD = marginNum * leverage;
  const assetQuantity = price > 0 ? positionSizeUSD / price : 0;

  // Estimated Liquidation Price calculation
  // For Long: entry * (1 - (1/leverage) * 0.9)
  // For Short: entry * (1 + (1/leverage) * 0.9)
  const estLiqPrice = side === 'buy'
    ? price * (1 - (0.9 / leverage))
    : price * (1 + (0.9 / leverage));

  const handlePercentageClick = (pct: number) => {
    const calculated = (account.freeMargin * (pct / 100)).toFixed(0);
    setMarginAmount(calculated);
  };

  const handleExecute = (e: React.FormEvent) => {
    e.preventDefault();
    if (marginNum <= 0 || marginNum > account.freeMargin) {
      alert('จำนวน Margin ไม่ถูกต้อง หรือยอดเงินคงเหลือไม่พอ');
      return;
    }

    const tpNum = parseFloat(takeProfit);
    const slNum = parseFloat(stopLoss);

    onOpenPosition({
      symbol: asset.symbol,
      side,
      entryPrice: price,
      amount: assetQuantity,
      margin: marginNum,
      leverage,
      takeProfit: isNaN(tpNum) ? undefined : tpNum,
      stopLoss: isNaN(slNum) ? undefined : slNum,
    });

    soundService.playOrderFilledSound();

    // Auto set price alert at TP or SL if requested
    if (autoSetAlerts) {
      if (!isNaN(tpNum) && tpNum > 0) {
        onSetAlert(tpNum, `Take Profit: ${side.toUpperCase()} ${asset.symbol}`);
      }
      if (!isNaN(slNum) && slNum > 0) {
        onSetAlert(slNum, `Stop Loss: ${side.toUpperCase()} ${asset.symbol}`);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden p-3 font-sans text-xs">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
        <span className="font-bold text-white text-xs">เปิดคำสั่งเทรด (Simulated Order)</span>
        <div className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
          <span>พอร์ต:</span>
          <span className="font-bold text-emerald-400">${account.freeMargin.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
      </div>

      <form onSubmit={handleExecute} className="space-y-3 flex-1 flex flex-col justify-between">
        <div>
          {/* Side Toggle: Long (Buy) vs Short (Sell) */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setSide('buy')}
              className={`py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                side === 'buy'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>ซื้อ / Long</span>
            </button>
            <button
              type="button"
              onClick={() => setSide('sell')}
              className={`py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                side === 'sell'
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              <span>ขาย / Short</span>
            </button>
          </div>

          {/* Order Type: Market / Limit */}
          <div className="flex items-center justify-between mt-2.5">
            <span className="text-slate-400 text-[11px]">ประเภทคำสั่ง:</span>
            <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setOrderType('market')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                  orderType === 'market' ? 'bg-slate-800 text-amber-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Market (ราคาตลาด)
              </button>
              <button
                type="button"
                onClick={() => setOrderType('limit')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                  orderType === 'limit' ? 'bg-slate-800 text-amber-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Limit (กำหนดราคา)
              </button>
            </div>
          </div>

          {/* Limit Price Input (if limit selected) */}
          {orderType === 'limit' && (
            <div className="mt-2">
              <label className="text-[10px] text-slate-400 block mb-1">ราคา Limit (USD):</label>
              <input
                type="number"
                step="any"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
          )}

          {/* Leverage Slider */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-400 text-[11px]">อัตราทดเลเวอเรจ (Leverage):</span>
              <span className="font-mono font-bold text-amber-400 text-xs">{leverage}x</span>
            </div>
            <div className="flex items-center gap-1">
              {[1, 2, 5, 10, 20, 50].map((lev) => (
                <button
                  key={lev}
                  type="button"
                  onClick={() => setLeverage(lev)}
                  className={`flex-1 py-1 font-mono text-[10px] rounded border transition-colors ${
                    leverage === lev
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {lev}x
                </button>
              ))}
            </div>
          </div>

          {/* Margin Investment Amount */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-400 text-[11px]">เงินค้ำประกัน (Margin USDT):</span>
              <span className="text-slate-500 text-[10px] font-mono">
                ขนาดออเดอร์: ${positionSizeUSD.toLocaleString()}
              </span>
            </div>
            <div className="relative">
              <input
                type="number"
                min="10"
                max={account.freeMargin}
                value={marginAmount}
                onChange={(e) => setMarginAmount(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
              <DollarSign className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2" />
            </div>

            {/* Quick balance percentage buttons */}
            <div className="grid grid-cols-4 gap-1 mt-1.5">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handlePercentageClick(pct)}
                  className="py-0.5 bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white rounded text-[10px] font-mono transition-colors"
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* TP & SL Inputs */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div>
              <label className="text-[10px] text-emerald-400 block mb-0.5">Take Profit (TP):</label>
              <input
                type="number"
                step="any"
                placeholder={side === 'buy' ? `>${price.toFixed(asset.decimals)}` : `<${price.toFixed(asset.decimals)}`}
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono text-[11px] placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-rose-400 block mb-0.5">Stop Loss (SL):</label>
              <input
                type="number"
                step="any"
                placeholder={side === 'buy' ? `<${price.toFixed(asset.decimals)}` : `>${price.toFixed(asset.decimals)}`}
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono text-[11px] placeholder-slate-600 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          {/* Auto set price alerts for TP/SL */}
          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>สร้างการแจ้งเตือนราคาที่ TP/SL อัตโนมัติ</span>
            </span>
            <input
              type="checkbox"
              checked={autoSetAlerts}
              onChange={(e) => setAutoSetAlerts(e.target.checked)}
              className="w-3.5 h-3.5 accent-amber-500 rounded cursor-pointer"
            />
          </div>

          {/* Risk Summary Card */}
          <div className="mt-3 p-2 bg-slate-950/70 rounded-lg border border-slate-800/80 space-y-1 font-mono text-[10px]">
            <div className="flex justify-between text-slate-400">
              <span>ราคาเข้า (Entry):</span>
              <span className="text-white">${price.toFixed(asset.decimals)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>ขนาดสัญญา:</span>
              <span className="text-white">{assetQuantity.toFixed(4)} {asset.symbol.split('/')[0]}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>ราคาล้างพอร์ต (Liq. Price):</span>
              <span className="text-rose-400 font-bold">${estLiqPrice.toFixed(asset.decimals)}</span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          type="submit"
          className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg transition-all cursor-pointer ${
            side === 'buy'
              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
              : 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
          }`}
        >
          {side === 'buy' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          <span>
            {side === 'buy' ? 'เปิดสถานะ ซื้อ (Open Long)' : 'เปิดสถานะ ขาย (Open Short)'} · ${marginAmount}
          </span>
        </button>
      </form>
    </div>
  );
};
