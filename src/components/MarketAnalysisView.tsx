import React, { useState } from 'react';
import { Asset, EvidenceItem, GroundingSource } from '../types/trading';
import { Sparkles, Search, ExternalLink, AlertCircle, ArrowUpRight, ArrowDownRight, Layers, Calendar, CheckCircle2, ShieldAlert, Globe } from 'lucide-react';

interface MarketAnalysisViewProps {
  assets: Asset[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

export const MarketAnalysisView: React.FC<MarketAnalysisViewProps> = ({
  assets,
  selectedSymbol,
  onSelectSymbol,
}) => {
  const [thesis, setThesis] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [groundingSources, setGroundingSources] = useState<GroundingSource[]>([]);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  const currentAsset = assets.find(a => a.symbol === selectedSymbol) || assets[0];

  const handleRunAnalysis = async () => {
    if (!thesis.trim()) {
      setError('กรุณากรอกสมมติฐาน (My thesis) ของคุณก่อนเริ่มการวิเคราะห์');
      return;
    }

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: currentAsset.symbol,
          assetName: currentAsset.name,
          thesis: thesis.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'การวิเคราะห์หลักฐานล้มเหลว');
      }

      setItems(data.items || []);
      setGroundingSources(data.groundingSources || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
      setError(msg);
      setItems([]);
      setGroundingSources([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-6xl mx-auto w-full pb-12 select-none">
      {/* Header card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">วิเคราะห์หลักฐานตลาด (Market Evidence Analysis)</h1>
            <p className="text-xs text-slate-400">
              วิเคราะห์และค้นหาหลักฐานจริงจากตลาดด้วย Gemini และ Google Search Grounding เพื่อสนับสนุนหรือคัดค้านสมมติฐานของคุณ
            </p>
          </div>
        </div>

        {/* Form controls */}
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Asset Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                เลือกสินทรัพย์ (Asset)
              </label>
              <select
                value={selectedSymbol}
                onChange={(e) => onSelectSymbol(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-amber-500"
              >
                {assets.map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.icon} {a.symbol} — {a.thaiName} ({a.name})
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Helper / Info */}
            <div className="md:col-span-2 flex items-center bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 text-xs text-slate-400">
              <span className="leading-relaxed">
                ระบบจะค้นหาข้อมูลอัปเดตแบบเรียลไทม์ เช่น ข้อมูลทางการ (T1: CFTC COT, FedWatch, BLS, ETF flow) 
                และความเห็นสถาบันหลัก (T2: Bloomberg, Reuters) โดยคัดกรองเฉพาะหลักฐานที่มีวันที่และแหล่งอ้างอิงชัดเจน
              </span>
            </div>
          </div>

          {/* Thesis input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              สมมติฐานของฉัน (My Thesis)
            </label>
            <textarea
              rows={3}
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              placeholder={`เช่น: ${currentAsset.symbol} มีแนวโน้มปรับตัวขึ้นต่อจากแรงหนุนเงินเฟ้อที่ชะลอตัวและการไหลเข้าของเงินทุนสถาบัน หรือ กำลังเข้าสู่โซนสะสมกำลัง`}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors leading-relaxed"
            />
          </div>

          {/* Submit CTA */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={handleRunAnalysis}
              disabled={loading}
              className={`px-5 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                loading
                  ? 'bg-amber-500/50 text-slate-900 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
              }`}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>กำลังค้นหาและตรวจสอบหลักฐานตลาด...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>เริ่มการวิเคราะห์หลักฐาน</span>
                </>
              )}
            </button>

            {hasSearched && items.length > 0 && (
              <span className="text-xs text-slate-400 font-mono">
                พบหลักฐานที่ผ่านการตรวจสอบ {items.length} รายการ
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error notification */}
      {error && (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-xl p-4 flex items-start gap-3 text-rose-200 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold block">ไม่สามารถดึงข้อมูลการวิเคราะห์ได้:</span>
            {error}
          </div>
        </div>
      )}

      {/* Results List */}
      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>รายการหลักฐานที่ตรวจสอบแล้ว ({currentAsset.symbol})</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {items.map((item, idx) => {
              const isBull = item.side === 'bull';
              return (
                <div
                  key={`${item.source_url}-${idx}`}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700/80 transition-all text-xs space-y-2.5"
                >
                  {/* Top badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Bull / Bear Side */}
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] ${
                          isBull
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        }`}
                      >
                        {isBull ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {isBull ? 'BULL (หนุน)' : 'BEAR (ต้าน)'}
                      </span>

                      {/* Layer */}
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-medium text-[10px] border border-slate-700/60">
                        {item.layer}
                      </span>

                      {/* Tier */}
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                          item.tier === 'T1'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                            : item.tier === 'T2'
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                        title={
                          item.tier === 'T1'
                            ? 'T1: Smart money / Official data (CFTC, Fed, BLS)'
                            : item.tier === 'T2'
                            ? 'T2: Major institutional consensus'
                            : 'T3: Single voice / retail'
                        }
                      >
                        Tier {item.tier}
                      </span>

                      {/* Label */}
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                          item.label === 'FACT'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : item.label === 'INFER'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {item.label}
                      </span>

                      {/* Side basis */}
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({item.side_basis})
                      </span>

                      {/* Verification Status */}
                      {item.verified === false && (
                        <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-rose-400" />
                          ลิงก์ไม่พบในผลค้นหาจริง
                        </span>
                      )}
                    </div>

                    {/* Date */}
                    <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-mono">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{item.date}</span>
                    </div>
                  </div>

                  {/* Evidence Value */}
                  <div className="text-slate-100 font-medium leading-relaxed text-[13px]">
                    {item.value}
                  </div>

                  {/* Mechanism */}
                  {item.mechanism && (
                    <div className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800/80 text-[11px] text-slate-300 leading-relaxed">
                      <span className="text-slate-400 font-semibold block text-[10px] uppercase mb-0.5">
                        กลไกการส่งผลต่อ {currentAsset.symbol} (Mechanism):
                      </span>
                      {item.mechanism}
                    </div>
                  )}

                  {/* Source Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <span className="text-slate-400">แหล่งข้อมูล:</span>
                      <span className="font-semibold text-slate-200">{item.source_name}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.verified === false && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-800/80 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-rose-400" />
                          ลิงก์ไม่พบในผลค้นหาจริง
                        </span>
                      )}
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono transition-colors"
                        title={item.source_url}
                      >
                        <span>เปิดลิงก์แหล่งที่มา</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Grounding Sources Summary */}
          {groundingSources.length > 0 && (
            <div className="mt-5 bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs">
              <div className="flex items-center gap-2 text-slate-300 font-semibold mb-2.5">
                <Globe className="w-4 h-4 text-cyan-400" />
                <span>แหล่งข้อมูลค้นหาจริงจาก Google Search Grounding ({groundingSources.length} แหล่ง):</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {groundingSources.map((gs, idx) => (
                  <a
                    key={idx}
                    href={gs.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-cyan-400 transition-colors text-[11px] font-mono truncate max-w-xs"
                    title={gs.title || gs.url}
                  >
                    <ExternalLink className="w-3 h-3 shrink-0 text-slate-500" />
                    <span className="truncate">{gs.title || gs.url}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No results notice */}
      {hasSearched && !loading && !error && items.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 space-y-2">
          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-500 mb-2">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-white">ไม่พบหลักฐานที่ผ่านเกณฑ์การตรวจสอบ</p>
          <p className="text-xs max-w-md mx-auto leading-relaxed">
            ระบบคัดกรองเฉพาะรายการที่มีแหล่งที่มา (URL) และวันที่ชัดเจน ลองปรับข้อความสมมติฐานหรือเลือกสินทรัพย์อื่น
          </p>
        </div>
      )}
    </div>
  );
};
