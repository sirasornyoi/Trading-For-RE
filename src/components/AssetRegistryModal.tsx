import React, { useState, useEffect, useMemo } from 'react';
import {
  RegistryAsset,
  RegistryAssetSource,
} from '../services/assetRegistry';
import { AssetCategory } from '../types/trading';
import {
  X,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Search,
  RefreshCw,
  Settings2,
} from 'lucide-react';

interface AssetRegistryModalProps {
  isOpen: boolean;
  onClose: () => void;
  registry: RegistryAsset[];
  onAddAsset: (asset: RegistryAsset) => void;
  onToggleMode: (symbol: string, mode: 'mode1' | 'mode2') => void;
  onRemoveAsset: (symbol: string) => void;
  onResetDefaults: () => void;
}

function inferDecimalsFromPrice(price: number): number {
  if (price >= 100) return 2;
  if (price >= 1) return 3;
  return 5;
}

function getDeletionSummary(symbol: string): {
  alertCount: number;
  hasScalpConfig: boolean;
  hasEntryTiers: boolean;
  csvCandleCount: number;
} {
  let alertCount = 0;
  let hasScalpConfig = false;
  let hasEntryTiers = false;
  let csvCandleCount = 0;

  try {
    const alertsRaw = localStorage.getItem('apextrade_alerts_v2');
    if (alertsRaw) {
      const parsed = JSON.parse(alertsRaw);
      if (Array.isArray(parsed)) {
        alertCount = parsed.filter((a: any) => a?.symbol === symbol).length;
      }
    }
  } catch {}

  try {
    const scalpRaw = localStorage.getItem('apextrade_breakout_scalp_configs_v1');
    if (scalpRaw) {
      const parsed = JSON.parse(scalpRaw);
      if (parsed && typeof parsed === 'object' && symbol in parsed) {
        hasScalpConfig = true;
      }
    }
  } catch {}

  try {
    const tiersRaw = localStorage.getItem('apextrade_entry_tiers_v1');
    if (tiersRaw) {
      const parsed = JSON.parse(tiersRaw);
      if (parsed && typeof parsed === 'object' && symbol in parsed) {
        hasEntryTiers = true;
      }
    }
  } catch {}

  try {
    const csvRaw = localStorage.getItem(`candles_${symbol}`);
    if (csvRaw) {
      const parsed = JSON.parse(csvRaw);
      if (Array.isArray(parsed)) {
        csvCandleCount = parsed.length;
      }
    }
  } catch {}

  return { alertCount, hasScalpConfig, hasEntryTiers, csvCandleCount };
}

export const AssetRegistryModal: React.FC<AssetRegistryModalProps> = ({
  isOpen,
  onClose,
  registry,
  onAddAsset,
  onToggleMode,
  onRemoveAsset,
  onResetDefaults,
}) => {
  const [source, setSource] = useState<RegistryAssetSource>('Kraken');
  const [krakenCoin, setKrakenCoin] = useState('');
  const [yahooTicker, setYahooTicker] = useState('');
  const [csvSymbol, setCsvSymbol] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [thaiName, setThaiName] = useState('');
  const [unit, setUnit] = useState('USD');
  const [category, setCategory] = useState<AssetCategory>('crypto');
  const [decimalsStr, setDecimalsStr] = useState('2');
  const [scalpBufferStr, setScalpBufferStr] = useState('0.05');
  const [showInMode1, setShowInMode1] = useState(true);
  const [showInMode2, setShowInMode2] = useState(true);

  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedKey, setVerifiedKey] = useState<string | null>(null);
  const [verifiedPrice, setVerifiedPrice] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [pendingDeleteSymbol, setPendingDeleteSymbol] = useState<string | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Reset form defaults when source tab changes
  const handleChangeSource = (nextSource: RegistryAssetSource) => {
    setSource(nextSource);
    setFormError(null);
    setVerifiedKey(null);
    setVerifiedPrice(null);
    if (nextSource === 'Kraken') {
      setCategory('crypto');
      setUnit('USD');
      setShowInMode2(true);
    } else if (nextSource === 'Yahoo') {
      setCategory('commodity');
      setUnit('USD');
      setShowInMode2(true);
    } else {
      setCategory('stock');
      setUnit('USD');
      setShowInMode2(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setFormError(null);
      setListError(null);
      setPendingDeleteSymbol(null);
      setConfirmResetOpen(false);
    }
  }, [isOpen]);

  const computedAddSpec = useMemo(() => {
    if (source === 'Kraken') {
      const coin = krakenCoin.trim().toUpperCase().replace(/\/USD$/i, '');
      const sym = coin ? `${coin}/USD` : '';
      return {
        symbol: sym,
        providerSymbol: sym,
        verifyKey: sym ? `Kraken|${sym}` : '',
        defaultName: displayName.trim() || coin,
        defaultThaiName: thaiName.trim() || coin,
      };
    }
    if (source === 'Yahoo') {
      const ticker = yahooTicker.trim();
      const sym = ticker.toUpperCase();
      return {
        symbol: sym,
        providerSymbol: ticker,
        verifyKey: ticker ? `Yahoo|${ticker}` : '',
        defaultName: displayName.trim() || ticker,
        defaultThaiName: thaiName.trim() || displayName.trim() || ticker,
      };
    }
    const sym = csvSymbol.trim().toUpperCase();
    return {
      symbol: sym,
      providerSymbol: '',
      verifyKey: 'CSV',
      defaultName: displayName.trim() || sym,
      defaultThaiName: thaiName.trim() || displayName.trim() || sym,
    };
  }, [source, krakenCoin, yahooTicker, csvSymbol, displayName, thaiName]);

  const isDuplicateSymbol = useMemo(() => {
    if (!computedAddSpec.symbol) return false;
    return registry.some(
      a => a.symbol.toUpperCase() === computedAddSpec.symbol.toUpperCase()
    );
  }, [registry, computedAddSpec.symbol]);

  const isVerifiedForCurrentInput =
    source === 'CSV' ||
    (verifiedKey !== null && verifiedKey === computedAddSpec.verifyKey);

  const handleVerify = async () => {
    setFormError(null);
    setVerifiedKey(null);
    setVerifiedPrice(null);

    if (source === 'Kraken') {
      if (!computedAddSpec.symbol) {
        setFormError('กรุณาใส่ชื่อเหรียญ เช่น XRP');
        return;
      }
      setIsVerifying(true);
      try {
        const res = await fetch(
          `/api/kraken/ohlc?symbol=${encodeURIComponent(computedAddSpec.symbol)}&timeframe=1d`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(data?.candles) || data.candles.length === 0) {
          setFormError(data?.error || `ไม่พบข้อมูล ${computedAddSpec.symbol} บน Kraken`);
          return;
        }
        const latestPrice = Number(data.candles[data.candles.length - 1].close);
        if (!isFinite(latestPrice) || latestPrice <= 0) {
          setFormError('ราคาที่ได้รับจาก Kraken ไม่ถูกต้อง');
          return;
        }
        const dec = inferDecimalsFromPrice(latestPrice);
        const buf = Number((latestPrice * 0.0002).toFixed(dec));
        setVerifiedPrice(latestPrice);
        setVerifiedKey(computedAddSpec.verifyKey);
        setDecimalsStr(String(dec));
        setScalpBufferStr(String(buf));
      } catch (err: any) {
        setFormError(err?.message || 'ตรวจสอบ Kraken ไม่สำเร็จ');
      } finally {
        setIsVerifying(false);
      }
      return;
    }

    if (source === 'Yahoo') {
      if (!computedAddSpec.providerSymbol) {
        setFormError('กรุณาใส่ Yahoo ticker เช่น CL=F หรือ NVDA');
        return;
      }
      setIsVerifying(true);
      try {
        const res = await fetch(
          `/api/klines?symbol=${encodeURIComponent(computedAddSpec.symbol)}&timeframe=1d&ticker=${encodeURIComponent(computedAddSpec.providerSymbol)}`
        );
        const data = await res.json().catch(() => ({}));
        const candles = Array.isArray(data?.candles) ? data.candles : [];
        const marketPrice =
          typeof data?.regularMarketPrice === 'number' && data.regularMarketPrice > 0
            ? data.regularMarketPrice
            : candles.length > 0
            ? Number(candles[candles.length - 1].close)
            : 0;

        if (!res.ok || candles.length === 0 || !isFinite(marketPrice) || marketPrice <= 0) {
          setFormError(data?.error || `ไม่พบข้อมูล ticker "${computedAddSpec.providerSymbol}" บน Yahoo Finance`);
          return;
        }
        const dec = inferDecimalsFromPrice(marketPrice);
        const buf = Number((marketPrice * 0.0002).toFixed(dec));
        setVerifiedPrice(marketPrice);
        setVerifiedKey(computedAddSpec.verifyKey);
        setDecimalsStr(String(dec));
        setScalpBufferStr(String(buf));
      } catch (err: any) {
        setFormError(err?.message || 'ตรวจสอบ Yahoo Finance ไม่สำเร็จ');
      } finally {
        setIsVerifying(false);
      }
    }
  };

  const handleSubmitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!computedAddSpec.symbol) {
      setFormError('กรุณาระบุสัญลักษณ์สินทรัพย์');
      return;
    }
    if (isDuplicateSymbol) {
      setFormError(`มีสินทรัพย์ ${computedAddSpec.symbol} อยู่ในรายการแล้ว (ห้ามซ้ำ)`);
      return;
    }
    if (source !== 'CSV' && !isVerifiedForCurrentInput) {
      setFormError('กรุณากดปุ่ม "ตรวจสอบ" และให้ผ่านก่อนบันทึก');
      return;
    }
    if (!showInMode1 && !(source !== 'CSV' && showInMode2)) {
      setFormError('กรุณาเลือกแสดงอย่างน้อย 1 แบบ');
      return;
    }

    const parsedDecimals = Math.max(0, Math.min(8, parseInt(decimalsStr, 10) || 2));
    const parsedBuffer = Math.max(0, parseFloat(scalpBufferStr) || 0);

    const newAsset: RegistryAsset = {
      symbol: computedAddSpec.symbol,
      name: computedAddSpec.defaultName,
      thaiName: computedAddSpec.defaultThaiName,
      icon: source === 'Kraken' ? '🪙' : source === 'Yahoo' ? '📈' : '📄',
      unit: unit.trim() || 'USD',
      decimals: parsedDecimals,
      category,
      source,
      providerSymbol: computedAddSpec.providerSymbol,
      showInMode1,
      showInMode2: source === 'CSV' ? false : showInMode2,
      scalpBuffer: parsedBuffer,
    };

    try {
      onAddAsset(newAsset);
      setKrakenCoin('');
      setYahooTicker('');
      setCsvSymbol('');
      setDisplayName('');
      setThaiName('');
      setVerifiedKey(null);
      setVerifiedPrice(null);
      setFormError(null);
    } catch (err: any) {
      setFormError(err?.message || 'เพิ่มสินทรัพย์ไม่สำเร็จ');
    }
  };

  const handleToggleWithGuard = (symbol: string, mode: 'mode1' | 'mode2') => {
    setListError(null);
    try {
      onToggleMode(symbol, mode);
    } catch (err: any) {
      setListError(err?.message || 'ไม่สามารถสลับการแสดงผลได้');
    }
  };

  const handleConfirmDelete = () => {
    if (!pendingDeleteSymbol) return;
    setListError(null);
    try {
      onRemoveAsset(pendingDeleteSymbol);
      setPendingDeleteSymbol(null);
    } catch (err: any) {
      setListError(err?.message || 'ลบสินทรัพย์ไม่สำเร็จ');
      setPendingDeleteSymbol(null);
    }
  };

  const handleConfirmReset = () => {
    setListError(null);
    onResetDefaults();
    setConfirmResetOpen(false);
  };

  const deletionSummary = useMemo(
    () => (pendingDeleteSymbol ? getDeletionSummary(pendingDeleteSymbol) : null),
    [pendingDeleteSymbol]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">จัดการรายการสินทรัพย์ (ใช้ร่วมกันทั้งแบบที่ 1 และแบบที่ 2)</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Delete Confirmation Banner */}
          {pendingDeleteSymbol && deletionSummary && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/50 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1.5 text-xs">
                  <div className="font-bold text-rose-300">
                    ยืนยันการลบสินทรัพย์ {pendingDeleteSymbol}?
                  </div>
                  <p className="text-slate-300">
                    ข้อมูลต่อไปนี้ของ <span className="font-mono font-bold text-white">{pendingDeleteSymbol}</span> จะถูกลบออกจากเครื่องถาวร:
                  </p>
                  <ul className="list-disc list-inside text-slate-300 space-y-0.5 font-sans">
                    <li>แจ้งเตือนราคาของ {pendingDeleteSymbol} ({deletionSummary.alertCount} รายการ)</li>
                    <li>ค่าตั้ง Breakout Scalp {deletionSummary.hasScalpConfig ? '(มีข้อมูลที่ตั้งไว้)' : '(ถ้ามี)'}</li>
                    <li>สถานะ Entry Tiers ระยะ 1–3 {deletionSummary.hasEntryTiers ? '(มีข้อมูลที่ตั้งไว้)' : '(ถ้ามี)'}</li>
                    <li>ข้อมูล CSV ที่บันทึกไว้ ({deletionSummary.csvCandleCount} แท่ง)</li>
                  </ul>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setPendingDeleteSymbol(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white cursor-pointer"
                >
                  ยืนยันลบทั้งหมด
                </button>
              </div>
            </div>
          )}

          {/* Reset Defaults Confirmation Banner */}
          {confirmResetOpen && (
            <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/50 space-y-3">
              <div className="flex items-start gap-2.5">
                <RotateCcw className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <div className="font-bold text-amber-300">ยืนยันคืนค่ารายการสินทรัพย์เริ่มต้น?</div>
                  <p className="text-slate-300">
                    ระบบจะคืนเฉพาะรายการสินทรัพย์เริ่มต้น 10 รายการ (BTC/USD, ETH/USD, SOL/USD, SI1!, XAU/USD, XAG/USD, WTI/USD, NVDA, TSLA, AAPL) โดยไม่ลบแจ้งเตือนหรือค่าตั้งของสินทรัพย์ที่ยังอยู่ในรายการ
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setConfirmResetOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleConfirmReset}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-xs font-bold text-slate-950 cursor-pointer"
                >
                  ยืนยันคืนค่าเริ่มต้น
                </button>
              </div>
            </div>
          )}

          {/* Asset List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                รายการสินทรัพย์ปัจจุบัน ({registry.length})
              </h3>
              <button
                onClick={() => {
                  setPendingDeleteSymbol(null);
                  setConfirmResetOpen(true);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-semibold text-amber-300 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>คืนค่ารายการเริ่มต้น</span>
              </button>
            </div>

            {listError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{listError}</span>
              </div>
            )}

            <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-950/60 overflow-hidden">
              {registry.map(item => (
                <div
                  key={item.symbol}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 hover:bg-slate-900/60"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-lg">{item.icon}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white font-mono">{item.symbol}</span>
                        <span className="text-[11px] text-slate-400 truncate">
                          {item.name} · {item.thaiName}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                            item.source === 'Kraken'
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                              : item.source === 'Yahoo'
                              ? 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                              : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          }`}
                        >
                          {item.source}
                          {item.providerSymbol && item.providerSymbol !== item.symbol
                            ? ` (${item.providerSymbol})`
                            : ''}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        ทศนิยม: {item.decimals} · Buffer: {item.scalpBuffer} · หน่วย: {item.unit}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => handleToggleWithGuard(item.symbol, 'mode1')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                        item.showInMode1
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                      }`}
                    >
                      แบบที่ 1 {item.showInMode1 ? '✓' : ''}
                    </button>

                    <button
                      type="button"
                      disabled={item.source === 'CSV'}
                      onClick={() => handleToggleWithGuard(item.symbol, 'mode2')}
                      title={
                        item.source === 'CSV'
                          ? 'สินทรัพย์ CSV ใช้ได้เฉพาะแบบที่ 1 (แบบที่ 2 ต้องใช้ข้อมูลสด)'
                          : 'สลับการแสดงในแบบที่ 2'
                      }
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                        item.source === 'CSV'
                          ? 'bg-slate-900/40 text-slate-600 border-slate-800/60 cursor-not-allowed'
                          : item.showInMode2
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 cursor-pointer'
                          : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300 cursor-pointer'
                      }`}
                    >
                      แบบที่ 2 {item.showInMode2 ? '✓' : ''}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setConfirmResetOpen(false);
                        setListError(null);
                        setPendingDeleteSymbol(item.symbol);
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                      title={`ลบ ${item.symbol}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add New Asset Form */}
          <form onSubmit={handleSubmitAdd} className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                <Plus className="w-4 h-4 text-amber-400" />
                <span>เพิ่มสินทรัพย์ใหม่</span>
              </div>
              <div className="flex items-center gap-1">
                {(['Kraken', 'Yahoo', 'CSV'] as RegistryAssetSource[]).map(src => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => handleChangeSource(src)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      source === src
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {src}
                  </button>
                ))}
              </div>
            </div>

            {/* Source-specific inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {source === 'Kraken' && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    ชื่อเหรียญ (เช่น XRP, DOGE, ADA) → คู่เทรด <span className="font-mono text-amber-300">{computedAddSpec.symbol || '.../USD'}</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={krakenCoin}
                      onChange={e => {
                        setKrakenCoin(e.target.value);
                        setVerifiedKey(null);
                        setVerifiedPrice(null);
                        setFormError(null);
                      }}
                      placeholder="เช่น XRP"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      disabled={isVerifying || !computedAddSpec.symbol}
                      onClick={handleVerify}
                      className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {isVerifying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      <span>ตรวจสอบ</span>
                    </button>
                  </div>
                </div>
              )}

              {source === 'Yahoo' && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Yahoo Ticker (เช่น CL=F, NVDA, EURUSD=X)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={yahooTicker}
                      onChange={e => {
                        setYahooTicker(e.target.value);
                        setVerifiedKey(null);
                        setVerifiedPrice(null);
                        setFormError(null);
                      }}
                      placeholder="เช่น CL=F หรือ NVDA"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      disabled={isVerifying || !computedAddSpec.providerSymbol}
                      onClick={handleVerify}
                      className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {isVerifying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      <span>ตรวจสอบ</span>
                    </button>
                  </div>
                </div>
              )}

              {source === 'CSV' && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Symbol (ใช้เฉพาะแบบที่ 1 — ไม่ต้องตรวจสอบ)
                  </label>
                  <input
                    type="text"
                    value={csvSymbol}
                    onChange={e => {
                      setCsvSymbol(e.target.value);
                      setFormError(null);
                    }}
                    placeholder="เช่น MSFT หรือ SET50"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">ชื่อที่แสดง (อังกฤษ)</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder={source === 'Kraken' ? 'เช่น Ripple' : source === 'Yahoo' ? 'เช่น Crude Oil WTI' : 'เช่น Microsoft Corp'}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">ชื่อภาษาไทย</label>
                <input
                  type="text"
                  value={thaiName}
                  onChange={e => setThaiName(e.target.value)}
                  placeholder="เช่น ริปเปิล / น้ำมันดิบ"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">หมวดหมู่</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as AssetCategory)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="crypto">คริปโต (Crypto)</option>
                    <option value="commodity">สินค้าโภคภัณฑ์ (Commodity)</option>
                    <option value="stock">หุ้น (Stock)</option>
                    <option value="other">อื่นๆ (Other)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">หน่วย</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={e => setUnit(e.target.value)}
                    placeholder="USD"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">ทศนิยม (Decimals)</label>
                  <input
                    type="number"
                    min={0}
                    max={8}
                    value={decimalsStr}
                    onChange={e => setDecimalsStr(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Scalp Buffer (0.02%)</label>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={scalpBufferStr}
                    onChange={e => setScalpBufferStr(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-end gap-4 pb-1">
                <label className="flex items-center gap-1.5 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showInMode1}
                    onChange={e => setShowInMode1(e.target.checked)}
                    className="rounded border-slate-600 accent-amber-500"
                  />
                  <span>แสดงในแบบที่ 1</span>
                </label>
                <label
                  className={`flex items-center gap-1.5 text-xs ${
                    source === 'CSV' ? 'text-slate-500 cursor-not-allowed' : 'text-slate-200 cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={source === 'CSV'}
                    checked={source === 'CSV' ? false : showInMode2}
                    onChange={e => setShowInMode2(e.target.checked)}
                    className="rounded border-slate-600 accent-emerald-500"
                  />
                  <span>แสดงในแบบที่ 2</span>
                </label>
              </div>
            </div>

            {verifiedPrice !== null && isVerifiedForCurrentInput && (
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  ตรวจสอบสำเร็จ · ราคาล่าสุด:{' '}
                  <span className="font-mono font-bold text-white">
                    ${verifiedPrice.toLocaleString(undefined, { minimumFractionDigits: Number(decimalsStr) || 2 })}
                  </span>
                </span>
              </div>
            )}

            {isDuplicateSymbol && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/40 text-xs text-amber-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>มีสินทรัพย์ {computedAddSpec.symbol} อยู่ในรายการแล้ว (ห้ามเพิ่มซ้ำ)</span>
              </div>
            )}

            {formError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isDuplicateSymbol || (source !== 'CSV' && !isVerifiedForCurrentInput)}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>เพิ่มสินทรัพย์</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
