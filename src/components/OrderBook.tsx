import React, { useMemo } from 'react';
import { Asset, OrderBookEntry, TradeTick } from '../types/trading';

interface OrderBookProps {
  asset: Asset;
  recentTrades: TradeTick[];
  onSelectPrice: (price: number) => void;
}

export const OrderBook: React.FC<OrderBookProps> = ({
  asset,
  recentTrades,
  onSelectPrice,
}) => {
  const currentPrice = asset.price;
  const decimals = asset.decimals;

  // Generate dynamic, realistic order book bids & asks around the current price
  const { asks, bids, spread } = useMemo(() => {
    const askRows: OrderBookEntry[] = [];
    const bidRows: OrderBookEntry[] = [];
    const tickStep = currentPrice > 1000 ? 0.5 : currentPrice > 100 ? 0.1 : 0.02;

    let askTotal = 0;
    for (let i = 5; i >= 1; i--) {
      const price = currentPrice + (i * tickStep);
      const amount = Number(((Math.random() * 2 + 0.5) * (currentPrice > 10000 ? 0.4 : currentPrice > 100 ? 15 : 200)).toFixed(2));
      askTotal += amount;
      askRows.push({ price, amount, total: askTotal, percent: Math.min(100, (askTotal / 40) * 100) });
    }

    let bidTotal = 0;
    for (let i = 1; i <= 5; i++) {
      const price = currentPrice - (i * tickStep);
      const amount = Number(((Math.random() * 2 + 0.5) * (currentPrice > 10000 ? 0.4 : currentPrice > 100 ? 15 : 200)).toFixed(2));
      bidTotal += amount;
      bidRows.push({ price, amount, total: bidTotal, percent: Math.min(100, (bidTotal / 40) * 100) });
    }

    const lowestAsk = askRows[askRows.length - 1]?.price || currentPrice;
    const highestBid = bidRows[0]?.price || currentPrice;
    const sp = Math.max(0.01, lowestAsk - highestBid);

    return { asks: askRows, bids: bidRows, spread: sp };
  }, [currentPrice]);

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-950/70 font-sans">
        <span className="text-xs font-bold text-slate-200">สมุดคำสั่งซื้อขาย (Order Book)</span>
        <span className="text-[10px] text-slate-400 font-mono">
          Spread: {spread.toFixed(decimals)}
        </span>
      </div>

      {/* Columns header */}
      <div className="grid grid-cols-3 px-3 py-1 text-[10px] text-slate-500 border-b border-slate-800/60 font-sans">
        <span>ราคา (Price)</span>
        <span className="text-right">จำนวน (Amount)</span>
        <span className="text-right">รวม (Total)</span>
      </div>

      {/* Asks (Sell Orders - Red) */}
      <div className="flex flex-col justify-end p-1 space-y-0.5">
        {asks.map((ask, idx) => (
          <div
            key={`ask-${idx}`}
            onClick={() => onSelectPrice(ask.price)}
            className="relative grid grid-cols-3 px-2 py-0.5 text-[11px] rounded hover:bg-slate-800/80 cursor-pointer transition-colors"
          >
            {/* Visual depth bar */}
            <div
              className="absolute right-0 top-0 bottom-0 bg-rose-500/10 pointer-events-none rounded-r"
              style={{ width: `${ask.percent}%` }}
            />
            <span className="text-rose-400 font-semibold">{ask.price.toFixed(decimals)}</span>
            <span className="text-right text-slate-300">{ask.amount.toFixed(2)}</span>
            <span className="text-right text-slate-400">{ask.total.toFixed(2)}</span>
          </div>
        ))}
      </div>

      {/* Current Price Divider */}
      <div className="my-1 px-3 py-1.5 bg-slate-950/90 border-y border-slate-800 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-cyan-400">
            ${currentPrice.toFixed(decimals)}
          </span>
          <span className={`text-[10px] font-semibold ${asset.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {asset.change24h >= 0 ? '▲' : '▼'} {asset.change24h.toFixed(2)}%
          </span>
        </div>
        <span className="text-[10px] text-slate-500 font-sans">ตลาดสด</span>
      </div>

      {/* Bids (Buy Orders - Green) */}
      <div className="flex flex-col p-1 space-y-0.5">
        {bids.map((bid, idx) => (
          <div
            key={`bid-${idx}`}
            onClick={() => onSelectPrice(bid.price)}
            className="relative grid grid-cols-3 px-2 py-0.5 text-[11px] rounded hover:bg-slate-800/80 cursor-pointer transition-colors"
          >
            {/* Visual depth bar */}
            <div
              className="absolute right-0 top-0 bottom-0 bg-emerald-500/10 pointer-events-none rounded-r"
              style={{ width: `${bid.percent}%` }}
            />
            <span className="text-emerald-400 font-semibold">{bid.price.toFixed(decimals)}</span>
            <span className="text-right text-slate-300">{bid.amount.toFixed(2)}</span>
            <span className="text-right text-slate-400">{bid.total.toFixed(2)}</span>
          </div>
        ))}
      </div>

      {/* Recent Trades Stream Section */}
      <div className="mt-auto border-t border-slate-800 pt-1">
        <div className="px-3 py-1 text-[10px] text-slate-400 font-sans font-semibold border-b border-slate-800/50">
          การซื้อขายล่าสุด (Recent Market Trades)
        </div>
        <div className="max-h-24 overflow-y-auto p-1 space-y-0.5 text-[10px]">
          {recentTrades.slice(0, 5).map(trade => (
            <div key={trade.id} className="grid grid-cols-3 px-2 py-0.5">
              <span className={trade.side === 'buy' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                ${trade.price.toFixed(decimals)}
              </span>
              <span className="text-right text-slate-300">{trade.amount.toFixed(2)}</span>
              <span className="text-right text-slate-500">
                {new Date(trade.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
