import React, { useState } from 'react';
import { Asset, PriceAlert } from '../types/trading';
import { Bell, BellOff, Trash2, CheckCircle2, RotateCcw, Volume2, ArrowUpRight, ArrowDownRight, X, Clock } from 'lucide-react';
import { soundService } from '../services/sound';

interface AlertDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: PriceAlert[];
  assets: Asset[];
  onToggleAlert: (id: string) => void;
  onDeleteAlert: (id: string) => void;
  onReArmAlert: (id: string) => void;
  onOpenCreateModal: () => void;
}

export const AlertDrawer: React.FC<AlertDrawerProps> = ({
  isOpen,
  onClose,
  alerts,
  assets,
  onToggleAlert,
  onDeleteAlert,
  onReArmAlert,
  onOpenCreateModal,
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');

  if (!isOpen) return null;

  const activeAlerts = alerts.filter(a => a.status === 'active' || a.status === 'disabled');
  const historyAlerts = alerts.filter(a => a.status === 'triggered');

  const getAsset = (symbol: string) => assets.find(a => a.symbol === symbol);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md h-full bg-slate-900 border-l border-slate-800 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Bell className="w-4 h-4 fill-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">ระบบจัดการการแจ้งเตือนราคา</h2>
              <p className="text-xs text-slate-400">จัดการจุดราคาและประวัติการเตือน</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-slate-800 bg-slate-950/40">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'active'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>กำลังเฝ้าระวัง ({activeAlerts.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>เตือนแล้ว ({historyAlerts.length})</span>
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeTab === 'active' ? (
            activeAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center p-6 border border-dashed border-slate-800 rounded-2xl">
                <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-500 mb-3">
                  <BellOff className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-slate-200 mb-1">ยังไม่มีการแจ้งเตือนราคาที่เปิดไว้</h4>
                <p className="text-xs text-slate-400 mb-4 max-w-xs">
                  ตั้งราคาเป้าหมายเพื่อรับเสียงเตือนทันทีเมื่อราคาบิตคอยน์ ทองคำ หรือหุ้นถึงจุดที่คุณต้องการ
                </p>
                <button
                  onClick={onOpenCreateModal}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  + ตั้งแจ้งเตือนใหม่ตอนนี้
                </button>
              </div>
            ) : (
              activeAlerts.map(alert => {
                const asset = getAsset(alert.symbol);
                const currentPrice = asset ? asset.price : alert.initialPrice;
                const priceDiff = alert.targetPrice - currentPrice;
                const percentDiff = (priceDiff / currentPrice) * 100;
                const isAbove = alert.condition === 'gte';

                // Closeness calculation (0% to 100%)
                const totalSpan = Math.abs(alert.targetPrice - alert.initialPrice);
                const currentCovered = Math.abs(currentPrice - alert.initialPrice);
                const progressPct = totalSpan > 0 ? Math.min(100, Math.max(0, (currentCovered / totalSpan) * 100)) : 50;

                return (
                  <div
                    key={alert.id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      alert.status === 'active'
                        ? 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                        : 'bg-slate-950/30 border-slate-800/50 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{asset?.icon || '📈'}</span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white">{alert.symbol}</span>
                            <span className="text-[10px] text-slate-400">{asset?.thaiName}</span>
                          </div>
                          {alert.note && (
                            <p className="text-[11px] text-amber-400/90 font-medium">{alert.note}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onToggleAlert(alert.id)}
                          className={`p-1.5 rounded-lg text-xs transition-colors ${
                            alert.status === 'active'
                              ? 'text-amber-400 hover:bg-slate-800'
                              : 'text-slate-500 hover:bg-slate-800'
                          }`}
                          title={alert.status === 'active' ? 'พักการเตือน' : 'เปิดการเตือน'}
                        >
                          {alert.status === 'active' ? <Bell className="w-4 h-4 fill-amber-400" /> : <BellOff className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => onDeleteAlert(alert.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                          title="ลบ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Target Price and Condition */}
                    <div className="flex items-baseline justify-between mb-2">
                      <div className="flex items-center gap-1 text-xs">
                        {isAbove ? (
                          <span className="text-emerald-400 flex items-center font-medium">
                            <ArrowUpRight className="w-3.5 h-3.5" /> ขึ้นถึง $\ge$
                          </span>
                        ) : (
                          <span className="text-rose-400 flex items-center font-medium">
                            <ArrowDownRight className="w-3.5 h-3.5" /> ลงถึง $\le$
                          </span>
                        )}
                        <span className="font-mono font-bold text-white text-sm">
                          ${alert.targetPrice.toLocaleString(undefined, { minimumFractionDigits: asset?.decimals || 2 })}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">ห่างจากราคาปัจจุบัน:</span>
                        <span className={`text-xs font-mono font-semibold ${Math.abs(percentDiff) < 1 ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>
                          {percentDiff >= 0 ? '+' : ''}{percentDiff.toFixed(2)}% (${Math.abs(priceDiff).toFixed(asset?.decimals || 2)})
                        </span>
                      </div>
                    </div>

                    {/* Closeness progress bar */}
                    <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          Math.abs(percentDiff) < 0.5 ? 'bg-amber-400 animate-pulse' : 'bg-cyan-500'
                        }`}
                        style={{ width: `${progressPct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            historyAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center p-6 border border-dashed border-slate-800 rounded-2xl">
                <Clock className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-xs text-slate-400">ยังไม่มีประวัติการแจ้งเตือนที่ถูกทริกเกอร์</p>
              </div>
            ) : (
              historyAlerts.map(alert => {
                const asset = getAsset(alert.symbol);
                return (
                  <div key={alert.id} className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{asset?.icon || '🔔'}</span>
                        <div>
                          <span className="text-xs font-bold text-white">{alert.symbol}</span>
                          <span className="text-[10px] text-slate-400 ml-1.5">
                            {alert.triggeredAt ? new Date(alert.triggeredAt).toLocaleTimeString() : ''}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30">
                        ทริกเกอร์แล้ว
                      </span>
                    </div>

                    <div className="text-xs flex items-center justify-between text-slate-300">
                      <span>เป้าหมายราคา:</span>
                      <span className="font-mono font-bold text-white">
                        ${alert.targetPrice.toLocaleString(undefined, { minimumFractionDigits: asset?.decimals || 2 })}
                      </span>
                    </div>

                    {alert.note && (
                      <p className="text-[11px] text-slate-400 italic">"{alert.note}"</p>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
                      <button
                        onClick={() => soundService.playPriceAlertSound()}
                        className="px-2 py-1 text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1 transition-colors"
                        title="ทดสอบเสียง"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>ฟังเสียง</span>
                      </button>
                      <button
                        onClick={() => onReArmAlert(alert.id)}
                        className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg flex items-center gap-1 font-medium transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>เปิดเตือนใหม่</span>
                      </button>
                      <button
                        onClick={() => onDeleteAlert(alert.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80">
          <button
            onClick={onOpenCreateModal}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Bell className="w-4 h-4 fill-slate-950" />
            <span>+ สร้างการแจ้งเตือนราคาใหม่</span>
          </button>
        </div>
      </div>
    </div>
  );
};
