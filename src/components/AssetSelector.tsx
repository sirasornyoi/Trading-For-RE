import React, { useState } from 'react';
import { Asset, AssetCategory, PriceAlert } from '../types/trading';
import { TrendingUp, TrendingDown, Bell, UploadCloud } from 'lucide-react';

interface AssetSelectorProps {
  assets: Asset[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  alerts: PriceAlert[];
  onUploadClick?: (symbol: string) => void;
}

export const AssetSelector: React.FC<AssetSelectorProps> = ({
  assets,
  selectedSymbol,
  onSelectSymbol,
  alerts,
  onUploadClick,
}) => {
  const [filter, setFilter] = useState<AssetCategory | 'all'>('all');

  const filteredAssets = assets.filter(
    a => filter === 'all' || a.category === filter
  );

  const getAlertCount = (symbol: string) => {
    return alerts.filter(a => a.symbol === symbol && a.status === 'active').length;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-2">
      {/* Category Filter Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-1">
          {[
            { id: 'all', label: 'ทั้งหมด' },
            { id: 'crypto', label: 'คริปโต (Crypto)' },
            { id: 'commodity', label: 'ทองคำ / เงิน / ฟิวเจอร์ส' },
            { id: 'stock', label: 'หุ้นเทคโนโลยี (Stocks)' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as AssetCategory | 'all')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                filter === tab.id
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-slate-400 hidden sm:block">
          ข้อมูลจริงจาก Binance & CSV Upload
        </div>
      </div>

      {/* Horizontal Asset Carousel / Ticker Strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {filteredAssets.map(asset => {
          const isSelected = asset.symbol === selectedSymbol;
          const hasPrice = asset.price !== undefined && asset.price !== null;
          const isUp = (asset.change24h ?? 0) >= 0;
          const alertCount = getAlertCount(asset.symbol);

          return (
            <button
              key={asset.symbol}
              onClick={() => onSelectSymbol(asset.symbol)}
              className={`flex-shrink-0 flex items-start gap-2.5 px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                isSelected
                  ? 'bg-slate-800 border-amber-500/80 shadow-md shadow-amber-500/10'
                  : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/40'
              }`}
            >
              <span className="text-xl mt-0.5">{asset.icon}</span>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white tracking-wide">{asset.symbol}</span>
                  <span className="text-[10px] text-slate-400">{asset.thaiName}</span>
                  {alertCount > 0 && (
                    <span className="flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.2 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                      <Bell className="w-2.5 h-2.5 fill-amber-300" />
                      {alertCount}
                    </span>
                  )}
                </div>

                {hasPrice ? (
                  <>
                    <div className="flex items-center gap-2 mt-0.5 font-mono">
                      <span className="text-xs font-bold text-slate-100">
                        ${asset.price!.toLocaleString(undefined, { minimumFractionDigits: asset.decimals })}
                      </span>
                      {(asset.changeVsPrevCandle !== undefined || asset.change24h !== undefined) && (
                        <span
                          className={`text-[11px] font-semibold flex items-center ${
                            (asset.changeVsPrevCandle ?? asset.change24h ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                          title="change vs previous candle"
                        >
                          {(asset.changeVsPrevCandle ?? asset.change24h ?? 0) >= 0 ? (
                            <TrendingUp className="w-3 h-3 inline mr-0.5" />
                          ) : (
                            <TrendingDown className="w-3 h-3 inline mr-0.5" />
                          )}
                          {(asset.changeVsPrevCandle ?? asset.change24h ?? 0) >= 0 ? '+' : ''}
                          {(asset.changeVsPrevCandle ?? asset.change24h ?? 0).toFixed(2)}%
                        </span>
                      )}
                    </div>
                    <div className="text-[9.5px] text-slate-400 font-sans mt-0.5">
                      Data as of {asset.lastCandleDate || 'Live'}
                      {asset.dataSource === 'CSV Upload' && asset.csvTimeframe ? ` (${asset.csvTimeframe})` : ''}
                      {' — Source: '}{asset.dataSource || 'Binance'}
                    </div>
                  </>
                ) : (
                  <div className="mt-0.5">
                    <span className="text-[11px] text-amber-400/90 font-medium flex items-center gap-1">
                      <UploadCloud className="w-3 h-3 inline" />
                      <span>ยังไม่มีข้อมูล — อัปโหลด CSV</span>
                    </span>
                    <div className="text-[9.5px] text-slate-500 font-sans mt-0.5">
                      Source: CSV upload
                    </div>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
