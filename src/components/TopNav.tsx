import React from 'react';
import { Bell, Volume2, VolumeX, ShieldAlert, Sparkles, TrendingUp } from 'lucide-react';

interface TopNavProps {
  activeView: 'trade' | 'alerts' | 'calculator';
  setActiveView: (view: 'trade' | 'alerts' | 'calculator') => void;
  activeAlertCount: number;
  onOpenAlertDrawer: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenCreateAlert: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeView,
  setActiveView,
  activeAlertCount,
  onOpenAlertDrawer,
  soundEnabled,
  onToggleSound,
  onOpenCreateAlert,
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3 border-b border-slate-800 bg-slate-950 sticky top-0 z-40 select-none">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <a href="/" className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-white whitespace-nowrap">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 font-black shadow-md shadow-amber-500/20">
            ▲
          </div>
          <span className="bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
            ApexTrade Pro
          </span>
        </a>
        <span className="hidden sm:inline-block text-[11px] font-medium text-slate-400 border-l border-slate-800 pl-3">
          สถานีเทรด & ระบบแจ้งเตือนราคาเรียลไทม์
        </span>
      </div>

      {/* Zone 2: Clean single-line navigation links */}
      <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-400">
        <button
          onClick={() => setActiveView('trade')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeView === 'trade' ? 'text-amber-400 font-bold' : ''
          }`}
        >
          กราฟและกระดานเทรด
        </button>
        <button
          onClick={onOpenAlertDrawer}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
            activeAlertCount > 0 ? 'text-amber-400' : ''
          }`}
        >
          <span>การแจ้งเตือนราคา</span>
          {activeAlertCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold font-mono">
              {activeAlertCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveView('calculator')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeView === 'calculator' ? 'text-amber-400 font-bold' : ''
          }`}
        >
          คำนวณความเสี่ยง & มาร์จิ้น
        </button>
      </nav>

      {/* Zone 3: Primary Action & Essential Controls */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Sound toggle */}
        <button
          onClick={onToggleSound}
          className={`p-2 rounded-lg border transition-colors cursor-pointer ${
            soundEnabled
              ? 'bg-slate-900 border-slate-700 text-amber-400'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
          title={soundEnabled ? 'ปิดเสียงเตือน' : 'เปิดเสียงเตือน'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        {/* Price Alerts Drawer Button */}
        <button
          onClick={onOpenAlertDrawer}
          className="relative p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-colors cursor-pointer"
          title="ดูรายการแจ้งเตือนราคา"
        >
          <Bell className="w-4 h-4" />
          {activeAlertCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-slate-950 font-mono text-[9px] font-bold rounded-full flex items-center justify-center">
              {activeAlertCount}
            </span>
          )}
        </button>

        {/* Primary CTA */}
        <button
          onClick={onOpenCreateAlert}
          className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-md shadow-amber-500/20 transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <Bell className="w-3.5 h-3.5 fill-slate-950" />
          <span>+ ตั้งเตือนราคา</span>
        </button>
      </div>
    </header>
  );
};
