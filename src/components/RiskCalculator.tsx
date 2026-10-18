import React, { useState } from 'react';
import { Asset } from '../types/trading';
import { Calculator, ShieldCheck, AlertTriangle, ArrowRight, DollarSign } from 'lucide-react';

interface RiskCalculatorProps {
  assets: Asset[];
  currentAsset: Asset;
}

export const RiskCalculator: React.FC<RiskCalculatorProps> = ({
  assets,
  currentAsset,
}) => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>(currentAsset.symbol);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [accountBalance, setAccountBalance] = useState<number>(50000);
  const [riskPercent, setRiskPercent] = useState<number>(2); // 2% risk rule
  const safePrice = currentAsset.price ?? 0;
  const [entryPrice, setEntryPrice] = useState<number>(safePrice);
  const [stopLossPrice, setStopLossPrice] = useState<number>(
    Number((safePrice * 0.98).toFixed(currentAsset.decimals))
  );
  const [takeProfitPrice, setTakeProfitPrice] = useState<number>(
    Number((safePrice * 1.04).toFixed(currentAsset.decimals))
  );
  const [leverage, setLeverage] = useState<number>(10);

  const asset = assets.find(a => a.symbol === selectedSymbol) || currentAsset;

  // Mathematical Risk Calculations
  const riskAmountUSD = (accountBalance * riskPercent) / 100;
  const slDistance = Math.abs(entryPrice - stopLossPrice);
  const slPercent = entryPrice > 0 ? (slDistance / entryPrice) * 100 : 0;
  
  const tpDistance = Math.abs(takeProfitPrice - entryPrice);
  const tpPercent = entryPrice > 0 ? (tpDistance / entryPrice) * 100 : 0;

  const riskRewardRatio = slDistance > 0 ? tpDistance / slDistance : 0;

  // Max Position size = Risk Amount / (SL Distance % * leverage)
  const recommendedPositionUSD = slPercent > 0 ? (riskAmountUSD / (slPercent / 100)) : 0;
  const recommendedMarginUSD = leverage > 0 ? recommendedPositionUSD / leverage : 0;
  const contractQuantity = entryPrice > 0 ? recommendedPositionUSD / entryPrice : 0;

  const estimatedProfit = tpPercent > 0 ? recommendedPositionUSD * (tpPercent / 100) : 0;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Calculator className="w-5 h-5 text-amber-400" />
            <span>เครื่องคำนวณความเสี่ยงและขนาดออเดอร์ (Risk & Position Sizing Calculator)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            คำนวณขนาดสัญญาที่ปลอดภัย ควบคุมการขาดทุนตามกฎ 1-2% Rule ป้องกันพอร์ตแตกสำหรับสินทรัพย์ความเสี่ยงสูง
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Input Parameters */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-2">
            พารามิเตอร์การวางแผนเทรด
          </h3>

          <div>
            <label className="text-xs text-slate-400 block mb-1">เลือกสินทรัพย์:</label>
            <select
              value={selectedSymbol}
              onChange={(e) => {
                const s = e.target.value;
                setSelectedSymbol(s);
                const found = assets.find(a => a.symbol === s);
                if (found) {
                  const fp = found.price ?? 0;
                  setEntryPrice(fp);
                  setStopLossPrice(Number((fp * 0.98).toFixed(found.decimals)));
                  setTakeProfitPrice(Number((fp * 1.04).toFixed(found.decimals)));
                }
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-medium focus:outline-none focus:border-amber-500"
            >
              {assets.map(a => (
                <option key={a.symbol} value={a.symbol}>
                  {a.icon} {a.symbol} ({a.thaiName}) - {a.price !== undefined ? `$${a.price.toFixed(a.decimals)}` : 'ยังไม่มีข้อมูล'}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">ยอดเงินพอร์ต (USD):</label>
              <input
                type="number"
                value={accountBalance}
                onChange={(e) => setAccountBalance(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">ความเสี่ยงต่อไม้ (% Risk):</label>
              <div className="flex items-center gap-1">
                {[1, 2, 3].map(pct => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setRiskPercent(pct)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-mono font-bold transition-colors ${
                      riskPercent === pct
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-slate-950 border-slate-700 text-slate-300'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">ราคาเข้า (Entry Price):</label>
              <input
                type="number"
                step="any"
                value={entryPrice}
                onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">เลเวอเรจ (Leverage):</label>
              <input
                type="number"
                min="1"
                max="100"
                value={leverage}
                onChange={(e) => setLeverage(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-rose-400 block mb-1">จุดตัดขาดทุน Stop Loss (USD):</label>
              <input
                type="number"
                step="any"
                value={stopLossPrice}
                onChange={(e) => setStopLossPrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-950 border border-rose-500/50 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-rose-500"
              />
            </div>
            <div>
              <label className="text-xs text-emerald-400 block mb-1">จุดทำกำไร Take Profit (USD):</label>
              <input
                type="number"
                step="any"
                value={takeProfitPrice}
                onChange={(e) => setTakeProfitPrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-950 border border-emerald-500/50 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Calculated Results */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-2 flex items-center justify-between">
              <span>ผลการวิเคราะห์ขนาดคำสั่งที่ปลอดภัย</span>
              <span className={`text-xs px-2 py-0.5 rounded font-mono ${
                riskRewardRatio >= 2 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
              }`}>
                R:R Ratio 1:{riskRewardRatio.toFixed(2)}
              </span>
            </h3>

            <div className="mt-4 space-y-3 font-mono text-xs">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-slate-400 block text-[11px] font-sans">ยอมรับการขาดทุนสูงสุด (Max Risk):</span>
                  <span className="text-rose-400 font-bold text-base">-${riskAmountUSD.toFixed(2)}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[11px] font-sans">เป้าหมายกำไร (Target Profit):</span>
                  <span className="text-emerald-400 font-bold text-base">+${estimatedProfit.toFixed(2)}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="font-sans">ขนาดสัญญาแนะนำ (Position Size):</span>
                  <span className="font-bold text-white text-sm">
                    ${recommendedPositionUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="font-sans">เงินวางค้ำประกันขั้นต่ำ (Margin):</span>
                  <span className="font-bold text-cyan-400 text-sm">
                    ${recommendedMarginUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="font-sans">จำนวนหน่วยสัญญา:</span>
                  <span className="text-slate-200">
                    {contractQuantity.toFixed(4)} {asset.symbol.split('/')[0]}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="font-sans">
              การตั้ง Stop Loss และตั้งแจ้งเตือนราคาล่วงหน้า ช่วยปกป้องเงินทุนของคุณจากความผันผวนรุนแรงของ Bitcoin และ Gold
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
