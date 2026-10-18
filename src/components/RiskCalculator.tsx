import React, { useState, useEffect, useMemo } from 'react';
import { Asset } from '../types/trading';
import { Calculator, AlertTriangle, ShieldCheck, TrendingUp, TrendingDown, Layers, Info } from 'lucide-react';

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
  const [accountBalance, setAccountBalance] = useState<string>('50000');
  const [riskPercent, setRiskPercent] = useState<string>('2');

  // Contract specification
  const isSilver = selectedSymbol === 'SI1!' || selectedSymbol === 'XAG/USD';
  const isGold = selectedSymbol === 'XAU/USD';
  const [contractType, setContractType] = useState<'standard' | 'micro'>('standard');

  const contractMultiplier = useMemo(() => {
    if (isSilver) {
      return contractType === 'micro' ? 1000 : 5000;
    }
    if (isGold) {
      return 100;
    }
    return 1;
  }, [isSilver, isGold, contractType]);

  const contractUnitLabel = useMemo(() => {
    if (isSilver) {
      return contractType === 'micro' ? 'Micro Silver (1,000 oz)' : 'COMEX Silver SI (5,000 oz)';
    }
    if (isGold) {
      return 'COMEX Gold GC (100 oz)';
    }
    return '1 หน่วย (1 Unit)';
  }, [isSilver, isGold, contractType]);

  // Entry, Stop Loss, and Take Profits (Leave empty if no price data)
  const [entryPrice, setEntryPrice] = useState<string>(
    currentAsset.price !== undefined ? currentAsset.price.toString() : ''
  );
  const [stopLossPrice, setStopLossPrice] = useState<string>(() => {
    if (currentAsset.price !== undefined) {
      return (currentAsset.price * 0.98).toFixed(currentAsset.decimals);
    }
    return '';
  });

  const [tp1Price, setTp1Price] = useState<string>(() => {
    if (currentAsset.price !== undefined) {
      return (currentAsset.price * 1.06).toFixed(currentAsset.decimals);
    }
    return '';
  });
  const [tp2Price, setTp2Price] = useState<string>(() => {
    if (currentAsset.price !== undefined) {
      return (currentAsset.price * 1.09).toFixed(currentAsset.decimals);
    }
    return '';
  });
  const [tp3Price, setTp3Price] = useState<string>(() => {
    if (currentAsset.price !== undefined) {
      return (currentAsset.price * 1.12).toFixed(currentAsset.decimals);
    }
    return '';
  });

  // Tranche Planner state: 2 or 3 tranches (Fix 2: default 3 tranches to 40/30/30, 2 tranches to 50/50)
  const [trancheCount, setTrancheCount] = useState<2 | 3>(3);
  const [tranche1Pct, setTranche1Pct] = useState<string>('40');
  const [tranche2Pct, setTranche2Pct] = useState<string>('30');
  const [tranche3Pct, setTranche3Pct] = useState<string>('30');
  const [tranche1Price, setTranche1Price] = useState<string>(entryPrice);
  const [tranche2Price, setTranche2Price] = useState<string>('');
  const [tranche3Price, setTranche3Price] = useState<string>('');

  // Keep tranche 1 price synced with main entry if not customized
  useEffect(() => {
    setTranche1Price(entryPrice);
  }, [entryPrice]);

  // Asset change handler
  const handleAssetSelect = (symbol: string) => {
    setSelectedSymbol(symbol);
    const found = assets.find(a => a.symbol === symbol);
    if (found && found.price !== undefined) {
      setEntryPrice(found.price.toString());
      const p = found.price;
      const dec = found.decimals;
      setStopLossPrice(side === 'buy' ? (p * 0.98).toFixed(dec) : (p * 1.02).toFixed(dec));
      setTp1Price(side === 'buy' ? (p * 1.06).toFixed(dec) : (p * 0.94).toFixed(dec));
      setTp2Price(side === 'buy' ? (p * 1.09).toFixed(dec) : (p * 0.91).toFixed(dec));
      setTp3Price(side === 'buy' ? (p * 1.12).toFixed(dec) : (p * 0.88).toFixed(dec));
    } else {
      // Leave empty if no price data
      setEntryPrice('');
      setStopLossPrice('');
      setTp1Price('');
      setTp2Price('');
      setTp3Price('');
    }
  };

  // When Side changes, adjust default SL / TP suggestions if prices are set
  const handleSideChange = (newSide: 'buy' | 'sell') => {
    setSide(newSide);
    const entry = parseFloat(entryPrice);
    const asset = assets.find(a => a.symbol === selectedSymbol) || currentAsset;
    const dec = asset.decimals;
    if (!isNaN(entry) && entry > 0) {
      setStopLossPrice(newSide === 'buy' ? (entry * 0.98).toFixed(dec) : (entry * 1.02).toFixed(dec));
      setTp1Price(newSide === 'buy' ? (entry * 1.06).toFixed(dec) : (entry * 0.94).toFixed(dec));
      setTp2Price(newSide === 'buy' ? (entry * 1.09).toFixed(dec) : (entry * 0.91).toFixed(dec));
      setTp3Price(newSide === 'buy' ? (entry * 1.12).toFixed(dec) : (entry * 0.88).toFixed(dec));
    }
  };

  // Mathematical Calculations
  const balanceNum = parseFloat(accountBalance) || 0;
  const riskPctNum = parseFloat(riskPercent) || 0;
  const entryNum = parseFloat(entryPrice) || 0;
  const slNum = parseFloat(stopLossPrice) || 0;
  const tp1Num = parseFloat(tp1Price) || 0;
  const tp2Num = parseFloat(tp2Price) || 0;
  const tp3Num = parseFloat(tp3Price) || 0;

  // Validation Rule 1: SL side verification
  let slError: string | null = null;
  if (entryNum > 0 && slNum > 0) {
    if (side === 'buy' && slNum >= entryNum) {
      slError = 'ข้อผิดพลาด: สำหรับฝั่งซื้อ (Buy) จุดตัดขาดทุน (Stop Loss) ต้องอยู่ต่ำกว่าราคาเข้า (SL < Entry)';
    } else if (side === 'sell' && slNum <= entryNum) {
      slError = 'ข้อผิดพลาด: สำหรับฝั่งขาย (Sell) จุดตัดขาดทุน (Stop Loss) ต้องอยู่สูงกว่าราคาเข้า (SL > Entry)';
    }
  }

  const isValidSetup = entryNum > 0 && slNum > 0 && !slError;

  // Risk budget in dollars
  const riskBudgetUSD = balanceNum > 0 && riskPctNum > 0 ? (balanceNum * (riskPctNum / 100)) : 0;
  const riskDistance = isValidSetup ? Math.abs(entryNum - slNum) : 0;

  // Fix 1: Round R/R to 2 decimals before comparing: Math.round(rr * 100) / 100 >= 3
  const calculateRR = (tp: number) => {
    if (!isValidSetup || tp <= 0 || riskDistance <= 0) return null;
    const rewardDistance = side === 'buy' ? (tp - entryNum) : (entryNum - tp);
    if (rewardDistance <= 0) return 0;
    const rawRR = rewardDistance / riskDistance;
    return Math.round(rawRR * 100) / 100;
  };

  const rr1 = calculateRR(tp1Num);
  const rr2 = calculateRR(tp2Num);
  const rr3 = calculateRR(tp3Num);

  // Position Sizing in whole contracts
  const riskPer1Contract = isValidSetup ? riskDistance * contractMultiplier : 0;
  const wholeContracts = (riskPer1Contract > 0 && riskBudgetUSD > 0)
    ? Math.floor(riskBudgetUSD / riskPer1Contract)
    : 0;

  const isRiskTooSmallFor1Contract = isValidSetup && riskPer1Contract > 0 && riskBudgetUSD < riskPer1Contract;

  // Fix 4: Fact calculations for 1 Standard contract and 1 Micro contract
  const standardMultiplier = isSilver ? 5000 : isGold ? 100 : 1;
  const microMultiplier = isSilver ? 1000 : isGold ? 10 : 0.1;

  const stdRiskUSD = riskDistance * standardMultiplier;
  const stdRiskPct = balanceNum > 0 ? (stdRiskUSD / balanceNum) * 100 : 0;

  const microRiskUSD = riskDistance * microMultiplier;
  const microRiskPct = balanceNum > 0 ? (microRiskUSD / balanceNum) * 100 : 0;

  // Fix 2: Tranche percentage validation (must equal exactly 100%)
  const t1Pct = parseFloat(tranche1Pct) || 0;
  const t2Pct = parseFloat(tranche2Pct) || 0;
  const t3Pct = trancheCount === 3 ? (parseFloat(tranche3Pct) || 0) : 0;
  const totalTranchePct = Math.round((t1Pct + t2Pct + t3Pct) * 100) / 100;
  const isTranchePctValid = totalTranchePct === 100;

  // Fix 3: Tranche sizing in whole contracts and total risk from each tranche's entry to SL
  const t1Price = parseFloat(tranche1Price) || entryNum;
  const t2Price = parseFloat(tranche2Price) || entryNum;
  const t3Price = parseFloat(tranche3Price) || entryNum;

  // Determine whole contracts per tranche
  const c1 = isTranchePctValid && wholeContracts > 0 ? Math.round((wholeContracts * t1Pct) / 100) : 0;
  const c2 = isTranchePctValid && wholeContracts > 0 ? Math.round((wholeContracts * t2Pct) / 100) : 0;
  const c3 = isTranchePctValid && trancheCount === 3 && wholeContracts > 0
    ? Math.round((wholeContracts * t3Pct) / 100)
    : 0;

  const tranche1Risk = isTranchePctValid && isValidSetup && c1 > 0 ? c1 * Math.abs(t1Price - slNum) * contractMultiplier : 0;
  const tranche2Risk = isTranchePctValid && isValidSetup && c2 > 0 ? c2 * Math.abs(t2Price - slNum) * contractMultiplier : 0;
  const tranche3Risk = isTranchePctValid && isValidSetup && c3 > 0 ? c3 * Math.abs(t3Price - slNum) * contractMultiplier : 0;

  const totalTrancheRiskUSD = tranche1Risk + tranche2Risk + (trancheCount === 3 ? tranche3Risk : 0);
  const doesTrancheRiskExceedBudget = isTranchePctValid && totalTrancheRiskUSD > riskBudgetUSD && riskBudgetUSD > 0;

  const totalTrancheContracts = c1 + c2 + (trancheCount === 3 ? c3 : 0);
  const averageEntry = totalTrancheContracts > 0
    ? (t1Price * c1 + t2Price * c2 + (trancheCount === 3 ? t3Price * c3 : 0)) / totalTrancheContracts
    : (t1Price * t1Pct + t2Price * t2Pct + (trancheCount === 3 ? t3Price * t3Pct : 0)) / 100;

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-5">
      {/* Page Title */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg lg:text-xl font-bold text-white flex items-center gap-2">
            <Calculator className="w-5 h-5 text-amber-400" />
            <span>เครื่องคำนวณความเสี่ยงและขนาดสัญญา (Risk & Position Sizing Calculator)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            เกณฑ์ R:R ขั้นต่ำ 1:3 คำนวณสัญญาเต็ม COMEX / Micro และวางแผนแบ่งไม้เข้าเทรด (Tranches)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Trade Parameters Input (7 Cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              พารามิเตอร์การวางแผนคำสั่ง
            </h3>
            {/* Asset Selector Dropdown */}
            <select
              value={selectedSymbol}
              onChange={(e) => handleAssetSelect(e.target.value)}
              className="px-2.5 py-1 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs font-medium focus:outline-none focus:border-amber-500"
            >
              {assets.map(a => (
                <option key={a.symbol} value={a.symbol}>
                  {a.icon} {a.symbol} ({a.thaiName})
                </option>
              ))}
            </select>
          </div>

          {/* Rule 1: Buy / Sell Selector */}
          <div>
            <label className="text-xs text-slate-400 block mb-1.5 font-semibold">ทิศทางการเทรด:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSideChange('buy')}
                className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  side === 'buy'
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'bg-slate-950/70 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>ซื้อ / Buy (Long)</span>
              </button>
              <button
                type="button"
                onClick={() => handleSideChange('sell')}
                className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  side === 'sell'
                    ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                    : 'bg-slate-950/70 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <TrendingDown className="w-4 h-4" />
                <span>ขาย / Sell (Short)</span>
              </button>
            </div>
          </div>

          {/* Capital and Risk Budget */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">ยอดเงินในพอร์ต (Account Balance USD):</label>
              <input
                type="number"
                value={accountBalance}
                onChange={(e) => setAccountBalance(e.target.value)}
                placeholder="50000"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">ความเสี่ยงที่ยอมรับได้ (% Risk):</label>
              <input
                type="number"
                step="0.1"
                value={riskPercent}
                onChange={(e) => setRiskPercent(e.target.value)}
                placeholder="2"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Contract Specification for Commodities (Silver & Gold) */}
          {isSilver && (
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1.5">
              <label className="text-xs text-slate-300 font-semibold block">
                ขนาดสัญญาโลหะเงิน (Silver Contract Size):
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setContractType('standard')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                    contractType === 'standard'
                      ? 'bg-amber-500/20 border border-amber-500 text-amber-300 font-bold'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  Standard SI (5,000 oz)
                </button>
                <button
                  type="button"
                  onClick={() => setContractType('micro')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                    contractType === 'micro'
                      ? 'bg-amber-500/20 border border-amber-500 text-amber-300 font-bold'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  Micro Silver (1,000 oz)
                </button>
              </div>
            </div>
          )}

          {isGold && (
            <div className="text-xs text-slate-400 font-mono px-3 py-1.5 bg-slate-950/60 rounded-lg border border-slate-800">
              สัญญา COMEX Gold (GC) = 100 oz
            </div>
          )}

          {/* Entry and Stop Loss (Rule 7: Leave empty if no price data) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300 block mb-1 font-semibold">
                ราคาเข้า (Entry Price USD):
              </label>
              <input
                type="number"
                step="any"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="ระบุราคาเข้า..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-rose-400 block mb-1 font-semibold">
                จุดตัดขาดทุน (Stop Loss USD):
              </label>
              <input
                type="number"
                step="any"
                value={stopLossPrice}
                onChange={(e) => setStopLossPrice(e.target.value)}
                placeholder={side === 'buy' ? '< ราคาเข้า' : '> ราคาเข้า'}
                className="w-full px-3 py-2 bg-slate-950 border border-rose-500/60 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-rose-400"
              />
            </div>
          </div>

          {/* Rule 1 Error: Stop Loss on wrong side */}
          {slError && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{slError}</span>
            </div>
          )}

          {/* Support TP1, TP2, TP3 */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <span className="text-xs font-semibold text-slate-300 block">
              เป้าหมายทำกำไร (Take Profit Targets):
            </span>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] text-emerald-400 block mb-1">TP 1:</label>
                <input
                  type="number"
                  step="any"
                  value={tp1Price}
                  onChange={(e) => setTp1Price(e.target.value)}
                  placeholder="TP 1"
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-emerald-400 block mb-1">TP 2:</label>
                <input
                  type="number"
                  step="any"
                  value={tp2Price}
                  onChange={(e) => setTp2Price(e.target.value)}
                  placeholder="TP 2"
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-emerald-400 block mb-1">TP 3:</label>
                <input
                  type="number"
                  step="any"
                  value={tp3Price}
                  onChange={(e) => setTp3Price(e.target.value)}
                  placeholder="TP 3"
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Fix 2 & Fix 3: Tranche Planner (Split position into 2–3 entries) */}
          <div className="pt-3 border-t border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>การวางแผนแบ่งไม้เข้าเทรด (Tranche Planner)</span>
              </span>
              <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setTrancheCount(2);
                    setTranche1Pct('50');
                    setTranche2Pct('50');
                  }}
                  className={`px-2 py-0.5 rounded font-mono cursor-pointer ${trancheCount === 2 ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'}`}
                >
                  2 ไม้ (50/50)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTrancheCount(3);
                    setTranche1Pct('40');
                    setTranche2Pct('30');
                    setTranche3Pct('30');
                  }}
                  className={`px-2 py-0.5 rounded font-mono cursor-pointer ${trancheCount === 3 ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'}`}
                >
                  3 ไม้ (40/30/30)
                </button>
              </div>
            </div>

            {/* Tranche Input Rows */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <span className="font-bold text-slate-300">ไม้ 1 (Tranche 1)</span>
                  <span className="font-mono text-emerald-400">{isTranchePctValid && wholeContracts > 0 ? `${c1} สัญญา` : '--'}</span>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="any"
                    value={tranche1Price}
                    onChange={(e) => setTranche1Price(e.target.value)}
                    placeholder="ราคาเข้า"
                    className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white font-mono text-[11px] focus:outline-none focus:border-amber-500"
                  />
                  <div className="relative w-16">
                    <input
                      type="number"
                      value={tranche1Pct}
                      onChange={(e) => setTranche1Pct(e.target.value)}
                      className="w-full px-1.5 py-1 bg-slate-900 border border-slate-700 rounded text-amber-400 font-mono text-[11px] focus:outline-none focus:border-amber-500"
                    />
                    <span className="absolute right-1 top-1 text-[10px] text-slate-500">%</span>
                  </div>
                </div>
                {isTranchePctValid && isValidSetup && c1 > 0 && (
                  <div className="text-[10px] font-mono text-slate-400 flex justify-between pt-0.5">
                    <span>ความเสี่ยง:</span>
                    <span className="text-rose-400">${tranche1Risk.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <span className="font-bold text-slate-300">ไม้ 2 (Tranche 2)</span>
                  <span className="font-mono text-emerald-400">{isTranchePctValid && wholeContracts > 0 ? `${c2} สัญญา` : '--'}</span>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="any"
                    value={tranche2Price}
                    onChange={(e) => setTranche2Price(e.target.value)}
                    placeholder="ราคาเข้า"
                    className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white font-mono text-[11px] focus:outline-none focus:border-amber-500"
                  />
                  <div className="relative w-16">
                    <input
                      type="number"
                      value={tranche2Pct}
                      onChange={(e) => setTranche2Pct(e.target.value)}
                      className="w-full px-1.5 py-1 bg-slate-900 border border-slate-700 rounded text-amber-400 font-mono text-[11px] focus:outline-none focus:border-amber-500"
                    />
                    <span className="absolute right-1 top-1 text-[10px] text-slate-500">%</span>
                  </div>
                </div>
                {isTranchePctValid && isValidSetup && c2 > 0 && (
                  <div className="text-[10px] font-mono text-slate-400 flex justify-between pt-0.5">
                    <span>ความเสี่ยง:</span>
                    <span className="text-rose-400">${tranche2Risk.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {trancheCount === 3 && (
                <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                    <span className="font-bold text-slate-300">ไม้ 3 (Tranche 3)</span>
                    <span className="font-mono text-emerald-400">{isTranchePctValid && wholeContracts > 0 ? `${c3} สัญญา` : '--'}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      step="any"
                      value={tranche3Price}
                      onChange={(e) => setTranche3Price(e.target.value)}
                      placeholder="ราคาเข้า"
                      className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white font-mono text-[11px] focus:outline-none focus:border-amber-500"
                    />
                    <div className="relative w-16">
                      <input
                        type="number"
                        value={tranche3Pct}
                        onChange={(e) => setTranche3Pct(e.target.value)}
                        className="w-full px-1.5 py-1 bg-slate-900 border border-slate-700 rounded text-amber-400 font-mono text-[11px] focus:outline-none focus:border-amber-500"
                      />
                      <span className="absolute right-1 top-1 text-[10px] text-slate-500">%</span>
                    </div>
                  </div>
                  {isTranchePctValid && isValidSetup && c3 > 0 && (
                    <div className="text-[10px] font-mono text-slate-400 flex justify-between pt-0.5">
                      <span>ความเสี่ยง:</span>
                      <span className="text-rose-400">${tranche3Risk.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Fix 2: Percentage Total Error or Tranche Results */}
            {!isTranchePctValid ? (
              <div className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  ข้อผิดพลาด: สัดส่วนเปอร์เซ็นต์รวมต้องเท่ากับ 100% พอดี (ปัจจุบันรวมได้: {totalTranchePct}%)
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400 font-sans">ราคาเฉลี่ยรวมทุกไม้ (Average Entry):</span>
                  <span className="font-bold text-amber-400">
                    ${averageEntry > 0 ? averageEntry.toFixed(currentAsset.decimals) : '--'}
                  </span>
                </div>

                <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400 font-sans">ความเสี่ยงรวมตามแผนแบ่งไม้:</span>
                  <span className="font-bold text-white">
                    ${totalTrancheRiskUSD.toFixed(2)}
                  </span>
                </div>

                {/* Fix 3 Warning: If total tranche risk exceeds risk budget */}
                {doesTrancheRiskExceedBudget && (
                  <div className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-xl text-xs text-rose-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-rose-400">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>ความเสี่ยงรวมของแผนแบ่งไม้ (${totalTrancheRiskUSD.toFixed(2)}) เกินงบความเสี่ยงที่กำหนด (${riskBudgetUSD.toFixed(2)})</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Calculations & R/R Rules (5 Cols) */}
        <div className="lg:col-span-5 space-y-4 flex flex-col">
          {/* Fix 1: R/R Display per TP with Math.round(rr * 100) / 100 >= 3 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 pb-2 border-b border-slate-800">
              อัตราผลตอบแทนต่อความเสี่ยง (Risk/Reward Ratio)
            </h3>

            {/* R/R per TP */}
            <div className="space-y-2">
              {[
                { label: 'TP 1', price: tp1Num, rr: rr1 },
                { label: 'TP 2', price: tp2Num, rr: rr2 },
                { label: 'TP 3', price: tp3Num, rr: rr3 },
              ].map(target => (
                <div
                  key={target.label}
                  className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-white block">{target.label}</span>
                    <span className="text-[11px] font-mono text-slate-400">
                      ${target.price > 0 ? target.price.toFixed(currentAsset.decimals) : '--'}
                    </span>
                  </div>

                  <div className="text-right">
                    {target.rr !== null && target.rr !== undefined && target.price > 0 ? (
                      <div>
                        {/* Fix 1: Compare rounded value >= 3 */}
                        {Math.round(target.rr * 100) / 100 >= 3 ? (
                          <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-lg font-mono font-bold text-xs inline-flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            1:{target.rr.toFixed(2)}
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-rose-500/20 text-rose-400 border border-rose-500/40 rounded-lg font-mono font-bold text-xs inline-flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            1:{target.rr.toFixed(2)} — R/R ต่ำกว่า 1:3
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-500 font-mono">--</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-[11px] text-slate-400 flex items-start gap-1.5 pt-1">
              <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>เกณฑ์มาตรฐาน: R/R ขั้นต่ำต้องไม่น้อยกว่า 1:3 (ปัดเศษ 2 ตำแหน่ง)</span>
            </div>
          </div>

          {/* Contract Size & Whole Contract Position */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 pb-2 border-b border-slate-800">
              ขนาดสัญญา & การคำนวณจำนวนสัญญา (Contract Sizing)
            </h3>

            <div className="space-y-2 font-mono text-xs">
              <div className="flex justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-slate-300">
                <span className="font-sans">ขนาดสัญญาที่เลือก:</span>
                <span className="font-bold text-white">{contractUnitLabel}</span>
              </div>

              <div className="flex justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-slate-300">
                <span className="font-sans">งบความเสี่ยงที่กำหนด (Risk Budget):</span>
                <span className="font-bold text-amber-400">${riskBudgetUSD.toFixed(2)}</span>
              </div>

              <div className="flex justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-slate-300">
                <span className="font-sans">ความเสี่ยงต่อ 1 สัญญาเต็ม:</span>
                <span className="font-bold text-rose-400">${riskPer1Contract.toFixed(2)}</span>
              </div>

              {/* Fix 4: When budget < 1 contract, show FACTS ONLY (no advice, never suggest moving SL) */}
              {isRiskTooSmallFor1Contract ? (
                <div className="p-3.5 bg-slate-950 border border-rose-500/40 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 text-rose-400 font-bold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>งบความเสี่ยง (${riskBudgetUSD.toFixed(2)}) เล็กกว่าความเสี่ยงของ 1 สัญญาเต็ม</span>
                  </div>

                  <div className="pt-2 border-t border-slate-800 space-y-1.5 text-[11px] font-mono">
                    <div className="flex justify-between text-slate-300">
                      <span className="font-sans">ความเสี่ยงของ 1 สัญญามาตรฐาน (Standard):</span>
                      <span className="font-bold text-white">
                        ${stdRiskUSD.toFixed(2)} ({stdRiskPct.toFixed(2)}% ของพอร์ต)
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-300">
                      <span className="font-sans">ความเสี่ยงของ 1 สัญญาไมโคร (Micro):</span>
                      <span className="font-bold text-cyan-400">
                        ${microRiskUSD.toFixed(2)} ({microRiskPct.toFixed(2)}% ของพอร์ต)
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Whole contracts allowed */
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-sans text-slate-300">ขนาดสัญญาที่เปิดได้ (Whole Contracts):</span>
                    <span className="font-bold text-base text-emerald-400">
                      {wholeContracts} สัญญา (Contracts)
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span className="font-sans">ความเสี่ยงจริงรวม:</span>
                    <span>
                      ${(wholeContracts * riskPer1Contract).toFixed(2)} (
                      {balanceNum > 0 ? (((wholeContracts * riskPer1Contract) / balanceNum) * 100).toFixed(2) : 0}%)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
