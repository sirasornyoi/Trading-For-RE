import React from 'react';
import { Asset, PaperAccount, Position } from '../types/trading';
import { ArrowUpRight, ArrowDownRight, X, Wallet, TrendingUp, AlertTriangle } from 'lucide-react';
import { soundService } from '../services/sound';

interface PositionsPanelProps {
  positions: Position[];
  assets: Asset[];
  account: PaperAccount;
  onClosePosition: (id: string) => void;
  onResetAccount: () => void;
}

export const PositionsPanel: React.FC<PositionsPanelProps> = ({
  positions,
  assets,
  account,
  onClosePosition,
  onResetAccount,
}) => {
  const getAsset = (symbol: string) => assets.find(a => a.symbol === symbol);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden font-sans">
      {/* Account Balance Metrics Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-2.5 bg-slate-950/70 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-amber-400" />
            <span className="text-slate-400 font-medium">ยอดเงินคงเหลือ (Balance):</span>
            <span className="font-mono font-bold text-white text-sm">
              ${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">มูลค่าสุทธิ (Equity):</span>
            <span className="font-mono font-bold text-cyan-400 text-sm">
              ${account.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">กำไร/ขาดทุนรวม (Total PnL):</span>
            <span
              className={`font-mono font-bold text-sm ${
                account.realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {account.realizedPnl >= 0 ? '+' : ''}${account.realizedPnl.toFixed(2)}
            </span>
          </div>
        </div>

        <button
          onClick={onResetAccount}
          className="text-[11px] text-slate-500 hover:text-amber-400 transition-colors"
          title="รีเซ็ตพอร์ตจำลองเป็น $50,000"
        >
          รีเซ็ตพอร์ต ($50,000)
        </button>
      </div>

      {/* Positions Table */}
      <div className="overflow-x-auto">
        {positions.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            ยังไม่มีสถานะการเทรดที่เปิดอยู่ (คลิก "ซื้อ/Long" หรือ "ขาย/Short" ด้านขวาเพื่อเริ่มทดลองเทรด)
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/40 text-slate-400 text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-2 px-4">สินทรัพย์</th>
                <th className="py-2 px-4">ทิศทาง / เลเวอเรจ</th>
                <th className="py-2 px-4 text-right">ราคาเข้า (Entry)</th>
                <th className="py-2 px-4 text-right">ราคาปัจจุบัน (Mark)</th>
                <th className="py-2 px-4 text-right">มาร์จิ้น / สัญญา</th>
                <th className="py-2 px-4 text-right">TP / SL</th>
                <th className="py-2 px-4 text-right">กำไร/ขาดทุน (PnL)</th>
                <th className="py-2 px-4 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {positions.map(pos => {
                const asset = getAsset(pos.symbol);
                const currentPrice = asset ? asset.price : pos.entryPrice;
                const isBuy = pos.side === 'buy';

                // Real-time floating PnL
                const priceDelta = isBuy ? (currentPrice - pos.entryPrice) : (pos.entryPrice - currentPrice);
                const currentPnl = (priceDelta / pos.entryPrice) * pos.margin * pos.leverage;
                const pnlPercent = (currentPnl / pos.margin) * 100;
                const isProfitable = currentPnl >= 0;

                return (
                  <tr key={pos.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-4 font-sans">
                      <div className="flex items-center gap-2">
                        <span>{asset?.icon || '📈'}</span>
                        <div>
                          <span className="font-bold text-white block">{pos.symbol}</span>
                          <span className="text-[10px] text-slate-400">{asset?.thaiName}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-2.5 px-4 font-sans">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-0.5 ${
                            isBuy
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {isBuy ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {isBuy ? 'LONG' : 'SHORT'}
                        </span>
                        <span className="text-amber-400 font-mono text-[11px]">{pos.leverage}x</span>
                      </div>
                    </td>

                    <td className="py-2.5 px-4 text-right text-slate-300">
                      ${pos.entryPrice.toLocaleString(undefined, { minimumFractionDigits: asset?.decimals || 2 })}
                    </td>

                    <td className="py-2.5 px-4 text-right font-bold text-white">
                      ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: asset?.decimals || 2 })}
                    </td>

                    <td className="py-2.5 px-4 text-right text-slate-300">
                      <div>${pos.margin.toLocaleString()}</div>
                      <div className="text-[10px] text-slate-500">
                        {pos.amount.toFixed(4)} {pos.symbol.split('/')[0]}
                      </div>
                    </td>

                    <td className="py-2.5 px-4 text-right text-[11px]">
                      <div className="text-emerald-400">
                        {pos.takeProfit ? `$${pos.takeProfit.toLocaleString()}` : '--'}
                      </div>
                      <div className="text-rose-400">
                        {pos.stopLoss ? `$${pos.stopLoss.toLocaleString()}` : '--'}
                      </div>
                    </td>

                    <td className="py-2.5 px-4 text-right">
                      <span className={`font-bold block ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfitable ? '+' : ''}${currentPnl.toFixed(2)}
                      </span>
                      <span className={`text-[10px] ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ({isProfitable ? '+' : ''}{pnlPercent.toFixed(2)}%)
                      </span>
                    </td>

                    <td className="py-2.5 px-4 text-center font-sans">
                      <button
                        onClick={() => {
                          onClosePosition(pos.id);
                          soundService.playOrderFilledSound();
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 rounded-lg text-[11px] font-semibold border border-slate-700 hover:border-rose-500/40 transition-all cursor-pointer"
                      >
                        ปิดสถานะ
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
