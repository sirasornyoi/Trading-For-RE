import React, { useState, useEffect } from 'react';
import { Asset, PriceAlert } from '../types/trading';
import { Bell, X, Volume2, ShieldAlert, ArrowUpRight, ArrowDownRight, Check } from 'lucide-react';
import { soundService } from '../services/sound';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: Asset;
  prefilledPrice?: number | null;
  onSaveAlert: (alert: Omit<PriceAlert, 'id' | 'createdAt' | 'status'>) => void;
}

export const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  onClose,
  asset,
  prefilledPrice,
  onSaveAlert,
}) => {
  const currentPrice = asset.price;
  const [targetPrice, setTargetPrice] = useState<string>(
    prefilledPrice ? prefilledPrice.toString() : currentPrice.toString()
  );
  const [condition, setCondition] = useState<'gte' | 'lte'>(
    prefilledPrice && prefilledPrice < currentPrice ? 'lte' : 'gte'
  );
  const [note, setNote] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [recurring, setRecurring] = useState<boolean>(false);
  const [hasBrowserPerm, setHasBrowserPerm] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setHasBrowserPerm(Notification.permission === 'granted');
    }
  }, []);

  useEffect(() => {
    if (prefilledPrice) {
      setTargetPrice(prefilledPrice.toFixed(asset.decimals));
      setCondition(prefilledPrice >= currentPrice ? 'gte' : 'lte');
    } else {
      // Default to +1% target
      const defaultTarget = currentPrice * 1.01;
      setTargetPrice(defaultTarget.toFixed(asset.decimals));
      setCondition('gte');
    }
  }, [prefilledPrice, currentPrice, asset.decimals, isOpen]);

  if (!isOpen) return null;

  const numTarget = parseFloat(targetPrice) || 0;
  const priceDiff = numTarget - currentPrice;
  const percentDiff = currentPrice > 0 ? (priceDiff / currentPrice) * 100 : 0;

  const handleApplyPreset = (percent: number) => {
    const calculated = currentPrice * (1 + percent / 100);
    setTargetPrice(calculated.toFixed(asset.decimals));
    setCondition(percent >= 0 ? 'gte' : 'lte');
  };

  const handleRequestBrowserPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      setHasBrowserPerm(perm === 'granted');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (numTarget <= 0) return;

    onSaveAlert({
      symbol: asset.symbol,
      targetPrice: numTarget,
      condition,
      initialPrice: currentPrice,
      note: note.trim() || undefined,
      soundEnabled,
      recurring,
    });

    // Play quick test sound so user confirms audio works
    if (soundEnabled) {
      soundService.playPriceAlertSound();
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Bell className="w-4 h-4 fill-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">ตั้งการแจ้งเตือนราคา (Price Alert)</h3>
              <p className="text-xs text-slate-400">{asset.thaiName} · {asset.symbol}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Current Market Price Banner */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800">
            <span className="text-xs text-slate-400">ราคาตลาดปัจจุบัน:</span>
            <span className="text-sm font-mono font-bold text-cyan-400">
              ${currentPrice.toFixed(asset.decimals)} {asset.unit}
            </span>
          </div>

          {/* Condition Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              เงื่อนไขการแจ้งเตือน (Trigger Condition)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCondition('gte')}
                className={`flex items-center justify-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                  condition === 'gte'
                    ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-sm'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                <span>ราคาขึ้นถึง $\ge$ (สูงกว่า)</span>
              </button>
              <button
                type="button"
                onClick={() => setCondition('lte')}
                className={`flex items-center justify-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                  condition === 'lte'
                    ? 'bg-indigo-500/15 border-indigo-500 text-indigo-300 shadow-sm'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <ArrowDownRight className="w-4 h-4 text-rose-400" />
                <span>ราคาลดลงถึง $\le$ (ต่ำกว่า)</span>
              </button>
            </div>
          </div>

          {/* Target Price Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                ราคาเป้าหมาย (Target Price)
              </label>
              {numTarget > 0 && (
                <span className={`text-[11px] font-mono font-semibold ${percentDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {percentDiff >= 0 ? '+' : ''}{percentDiff.toFixed(2)}% (${priceDiff >= 0 ? '+' : ''}{priceDiff.toFixed(asset.decimals)})
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                step="any"
                required
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="ระบุราคาที่ต้องการให้เตือน..."
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-base focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                {asset.unit}
              </span>
            </div>

            {/* Quick Percentage Chips */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[10px] text-slate-500 mr-1">ปุ่มลัด:</span>
              {[1, 2, 5].map((pct) => (
                <button
                  key={`+${pct}`}
                  type="button"
                  onClick={() => handleApplyPreset(pct)}
                  className="px-2 py-0.5 text-[10px] font-mono font-medium rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors"
                >
                  +{pct}%
                </button>
              ))}
              {[-1, -2, -5].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleApplyPreset(pct)}
                  className="px-2 py-0.5 text-[10px] font-mono font-medium rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors"
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              บันทึก / ข้อความช่วยจำ (Note)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น จุด Take Profit, ทะลุต้าน $68,500, ช้อนซื้อแนวรับ..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Alert Options */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-300">เล่นเสียงเตือน (Audio Alert)</span>
              </div>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-slate-300">การแจ้งเตือนของเบราว์เซอร์</span>
              </div>
              {hasBrowserPerm ? (
                <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                  <Check className="w-3 h-3" /> เปิดแล้ว
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleRequestBrowserPermission}
                  className="text-[10px] text-cyan-400 underline hover:text-cyan-300"
                >
                  อนุญาตการแจ้งเตือน
                </button>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300">เตือนซ้ำทุกครั้งที่ราคาตัดผ่าน (Recurring)</span>
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
            >
              ยืนยันการตั้งเตือน
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
