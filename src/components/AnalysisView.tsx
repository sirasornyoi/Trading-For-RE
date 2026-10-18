import React, { useState } from 'react';
import { Asset, EvidenceItem } from '../types/trading';
import { Sparkles, Search, ExternalLink, AlertCircle, Loader2, ArrowUpRight, ArrowDownRight, ShieldCheck, Info } from 'lucide-react';

interface AnalysisViewProps {
  assets: Asset[];
  currentAsset: Asset;
  onSelectSymbol: (symbol: string) => void;
}

export const AnalysisView: React.FC<AnalysisViewProps> = ({
  assets,
  currentAsset,
  onSelectSymbol,
}) => {
  const [thesis, setThesis] = useState<string>('ราคาทรงตัวเหนือแนวรับสำคัญ คาดหวังแรงซื้อจากการคาดการณ์การปรับลดดอกเบี้ยและกระแสเงินทุนสถาบัน');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);

  const handleAnalyze = async () => {
    if (!thesis.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: currentAsset.symbol,
          assetName: `${currentAsset.name} (${currentAsset.thaiName})`,
          thesis: thesis.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${res.status}`);
      }

      const data = await res.json();
      setEvidenceItems(data.items || []);
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการวิเคราะห์ข้อมูล');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto py-2">
      {/* Top Banner & Asset Picker */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">วิเคราะห์หลักฐานตลาด (Market Evidence Analyst)</h2>
              <p className="text-xs text-slate-400">
                ค้นหาและตรวจสอบหลักฐานสนับสนุนหรือโต้แย้งสมมติฐาน พร้อมอ้างอิงแหล่งข้อมูลจริง (Google Search Grounding)
              </p>
            </div>
          </div>

          {/* Asset Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">สินทรัพย์:</span>
            <select
              value={currentAsset.symbol}
              onChange={(e) => onSelectSymbol(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-amber-500"
            >
              {assets.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.icon} {a.symbol} - {a.thaiName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* My Thesis Input */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-200">
            สมมติฐานการเทรดของคุณ (My Thesis)
          </label>
          <textarea
            rows={3}
            value={thesis}
            onChange={(e) => setThesis(e.target.value)}
            placeholder="ระบุสมมติฐานของคุณ เช่น มุมมองต่อทิศทางราคา ข่าว หรือปัจจัยที่กำลังจับตามอง..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans leading-relaxed"
          />
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-between pt-1">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>AI ทำหน้าที่รวบรวมหลักฐาน ไม่ตัดสินซื้อ/ขายแทนคุณ</span>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={isLoading || !thesis.trim()}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>กำลังค้นหาหลักฐาน...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>วิเคราะห์หลักฐานตลาด</span>
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Evidence Items List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-bold text-slate-200">
            รายการหลักฐานที่พบ ({evidenceItems.length})
          </h3>
          {evidenceItems.length > 0 && (
            <span className="text-xs text-slate-400 font-mono">
              คัดกรองเฉพาะข้อมูลที่มี URL และวันที่
            </span>
          )}
        </div>

        {evidenceItems.length === 0 && !isLoading && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 mx-auto mb-2">
              <Search className="w-6 h-6" />
            </div>
            <p className="text-xs text-slate-300 font-semibold">ยังไม่มีรายการหลักฐาน</p>
            <p className="text-[11px] text-slate-400 max-w-md mx-auto leading-relaxed">
              ใส่สมมติฐานการเทรดของคุณ แล้วกดปุ่ม "วิเคราะห์หลักฐานตลาด" เพื่อให้ระบบค้นหาข้อมูลยืนยันจาก Google Search
            </p>
          </div>
        )}

        {evidenceItems.map((item, idx) => {
          const isBull = item.side === 'bull';
          return (
            <div
              key={`${item.source_url}-${idx}`}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-xl p-4 space-y-2.5 transition-colors"
            >
              {/* Header Badges */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                  {/* Side */}
                  <span
                    className={`px-2 py-0.5 rounded-md font-bold flex items-center gap-1 ${
                      isBull
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    }`}
                  >
                    {isBull ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {item.side.toUpperCase()}
                  </span>

                  {/* Layer */}
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                    {item.layer}
                  </span>

                  {/* Label (FACT | INFER | SPEC) */}
                  <span
                    className={`px-2 py-0.5 rounded-md font-bold ${
                      item.label === 'FACT'
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                        : item.label === 'INFER'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                        : 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
                    }`}
                  >
                    {item.label}
                  </span>

                  {/* Tier (T1 | T2 | T3) */}
                  <span
                    className={`px-2 py-0.5 rounded-md font-bold ${
                      item.tier === 'T1'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : item.tier === 'T2'
                        ? 'bg-slate-800 text-slate-300 border border-slate-700'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}
                    title={item.tier === 'T1' ? 'T1: Smart money / ข้อมูลทางการ' : 'T2: สถาบันการเงินหลัก'}
                  >
                    {item.tier}
                  </span>

                  {/* Side basis */}
                  <span className="text-[10px] text-slate-400">
                    ({item.side_basis})
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 font-mono">
                  {item.date}
                </div>
              </div>

              {/* Verified Value / Statement */}
              <div className="text-xs text-white font-medium leading-relaxed">
                {item.value}
              </div>

              {/* Transmission Mechanism */}
              {item.mechanism && (
                <div className="text-[11px] text-slate-400 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 space-y-0.5">
                  <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide block">
                    กลไกส่งผลต่อราคา (Transmission Mechanism):
                  </span>
                  <p className="leading-relaxed">{item.mechanism}</p>
                </div>
              )}

              {/* Source & Verified Link Footer */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                <div className="text-slate-400">
                  แหล่งข้อมูล: <span className="text-slate-200 font-medium">{item.source_name}</span>
                </div>
                {item.source_url && (
                  <a
                    href={item.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium transition-colors"
                  >
                    <span>เปิดแหล่งอ้างอิง</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
