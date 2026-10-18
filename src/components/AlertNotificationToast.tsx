import React from 'react';
import { PriceAlert, Asset } from '../types/trading';
import { Bell, X, ArrowUpRight, ArrowDownRight, Volume2 } from 'lucide-react';
import { soundService } from '../services/sound';

interface AlertNotificationToastProps {
  alert: PriceAlert | null;
  asset: Asset | undefined;
  onDismiss: () => void;
  onSelectAsset?: (symbol: string) => void;
}

export const AlertNotificationToast: React.FC<AlertNotificationToastProps> = ({
  alert,
  asset,
  onDismiss,
  onSelectAsset,
}) => {
  if (!alert) return null;

  const isAbove = alert.condition === 'gte';

  return (
    <div className="fixed top-5 right-5 z-50 max-w-sm w-full bg-slate-900 border-2 border-amber-500 rounded-2xl shadow-2xl shadow-amber-500/20 overflow-hidden animate-in slide-in-from-top-4 duration-300">
      {/* Top golden glowing bar */}
      <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 animate-pulse"></div>

      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500 flex items-center justify-center text-amber-400">
                <Bell className="w-5 h-5 fill-amber-400 animate-bounce" />
              </div>
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900 animate-ping"></span>
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">ราคาถึงจุดที่กำหนดแล้ว!</span>
              </div>
              <h4 className="text-sm font-bold text-white flex items-center gap-1">
                <span>{alert.symbol}</span>
                <span className="text-xs text-slate-400 font-normal">({asset?.thaiName})</span>
              </h4>
            </div>
          </div>

          <button
            onClick={onDismiss}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Price Detail */}
        <div className="mt-3 p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 block">เงื่อนไข:</span>
            <span className="text-xs font-medium text-slate-300 flex items-center gap-1">
              {isAbove ? (
                <>
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                  <span>ขึ้นแตะ $\ge$</span>
                </>
              ) : (
                <>
                  <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
                  <span>ลงแตะ $\le$</span>
                </>
              )}
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 block">ราคาเป้าหมาย:</span>
            <span className="text-sm font-mono font-bold text-amber-400">
              ${alert.targetPrice.toLocaleString(undefined, { minimumFractionDigits: asset?.decimals || 2 })}
            </span>
          </div>
        </div>

        {alert.note && (
          <p className="mt-2 text-xs text-slate-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg">
            ⚡ {alert.note}
          </p>
        )}

        {/* Action Controls */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            onClick={() => soundService.playPriceAlertSound()}
            className="p-1.5 text-slate-400 hover:text-amber-400 rounded-lg hover:bg-slate-800 transition-colors"
            title="เล่นเสียงอีกครั้ง"
          >
            <Volume2 className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            {onSelectAsset && (
              <button
                onClick={() => {
                  onSelectAsset(alert.symbol);
                  onDismiss();
                }}
                className="px-3 py-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-semibold transition-colors"
              >
                ดูกราฟนี้
              </button>
            )}
            <button
              onClick={onDismiss}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
            >
              รับทราบ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
