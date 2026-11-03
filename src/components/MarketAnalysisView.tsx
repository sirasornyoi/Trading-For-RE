import React, { useState } from 'react';
import { Asset, EvidenceItem, GroundingSource } from '../types/trading';
import {
  Sparkles,
  Search,
  ExternalLink,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Calendar,
  CheckCircle2,
  Globe,
  HelpCircle,
} from 'lucide-react';

interface MarketAnalysisViewProps {
  assets: Asset[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

const TIER_ORDER: Record<string, number> = {
  T1: 1,
  T2: 2,
  T3: 3,
};

const LAYERS: { key: 'Fundamental' | 'Technical' | 'News'; label: string; weight: string; description: string }[] = [
  { key: 'Fundamental', label: 'Fundamental', weight: '60%', description: 'ปัจจัยพื้นฐาน นโยบายการเงิน ตัวเลขเศรษฐกิจ และกระแสเงินทุน' },
  { key: 'Technical', label: 'Technical', weight: '30%', description: 'โครงสร้างราคา ตัวชี้วัดทางเทคนิค แนวรับแนวต้าน และโมเมนตัม' },
  { key: 'News', label: 'News', weight: '10%', description: 'ข่าวสาร เหตุการณ์ฉับพลัน และกระแสข่าวรายวัน' },
];

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
    if (thesis.trim().length > 1000) {
      setError('สมมติฐานต้องมีความยาวไม่เกิน 1,000 ตัวอักษร');
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

  const missingItems = items.filter(i => i.missing);
  const validItems = items.filter(i => !i.missing);
  const verifiedCount = items.filter(i => i.verified).length;

  return (
    <div className="flex flex-col gap-5 max-w-6xl mx-auto w-full pb-12 select-none">
      {/* Header card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">วิเคราะห์หลักฐานตลาด (Market Evidence Analysis)</h1>
            <p className="text-xs text-slate-400">
              วิเคราะห์และค้นหาหลักฐานจริงจากตลาดด้วย Gemini และ Google Search Grounding เพื่อตรวจสอบสมมติฐานของคุณ
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
                ระบบจะค้นหาข้อมูลอัปเดตแบบเรียลไทม์ 4 หัวข้อบังคับ (ราคา, Fed rate & Yields, CPI, ETF flow) 
                และคัดกรองเฉพาะหลักฐานที่มีวันที่และแหล่งอ้างอิงชัดเจน ตรวจสอบโดเมนกับผลการค้นหาจริง
              </span>
            </div>
          </div>

          {/* Thesis input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                สมมติฐานของฉัน (My Thesis)
              </label>
              <span className={`text-[10px] font-mono ${thesis.length > 1000 ? 'text-rose-400 font-bold' : 'text-slate-500'}`}>
                {thesis.length}/1000 ตัวอักษร
              </span>
            </div>
            <textarea
              rows={3}
              maxLength={1000}
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
                พบหลักฐาน {items.length} รายการ (พบโดเมนในผลค้นหา {verifiedCount} รายการ)
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

      {/* Results Section */}
      {items.length > 0 && (
        <div className="space-y-6">
          {/* Missing Mandatory Topics Box (Gray Box on Top) */}
          {missingItems.length > 0 && (
            <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <AlertCircle className="w-4 h-4 text-slate-400" />
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  หัวข้อบังคับที่ยังหาไม่เจอ ({missingItems.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {missingItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-300 flex items-start justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <span className="font-semibold text-slate-200 block">{item.value}</span>
                      {item.mechanism && (
                        <span className="text-[11px] text-slate-500 block">{item.mechanism}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono shrink-0 px-1.5 py-0.5 bg-slate-900 rounded border border-slate-800">
                      {item.layer}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3 Groups by Layer (Valid Items only) */}
          {LAYERS.map(layer => {
            const layerItems = validItems.filter(i => i.layer === layer.key);
            const bullItems = layerItems
              .filter(i => i.side === 'bull')
              .sort((a, b) => (TIER_ORDER[a.tier] || 99) - (TIER_ORDER[b.tier] || 99));
            const bearItems = layerItems
              .filter(i => i.side === 'bear')
              .sort((a, b) => (TIER_ORDER[a.tier] || 99) - (TIER_ORDER[b.tier] || 99));

            return (
              <div key={layer.key} className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
                {/* Layer Group Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-400" />
                    <h2 className="text-sm font-bold text-white tracking-wide">
                      {layer.label} ({layer.weight})
                    </h2>
                    <span className="text-[11px] text-slate-400 hidden sm:inline">
                      — {layer.description}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {layerItems.length} รายการ
                  </span>
                </div>

                {/* 2 Columns: BULL (Left) | BEAR (Right) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Column 1: BULL */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 px-1 py-1 rounded bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 text-xs font-bold">
                      <ArrowUpRight className="w-4 h-4" />
                      <span>BULL</span>
                      <span className="text-[10px] text-emerald-500/80 font-mono ml-auto">
                        ({bullItems.length})
                      </span>
                    </div>

                    {bullItems.length === 0 ? (
                      <div className="p-4 rounded-lg bg-slate-950/40 border border-slate-800/50 text-center text-slate-500 text-xs">
                        ไม่มีหลักฐานฝั่ง BULL ในหมวดนี้
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {bullItems.map((item, idx) => (
                          <EvidenceCard key={`${item.source_url}-${idx}`} item={item} currentSymbol={currentAsset.symbol} />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Column 2: BEAR */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 px-1 py-1 rounded bg-rose-950/40 border border-rose-800/40 text-rose-400 text-xs font-bold">
                      <ArrowDownRight className="w-4 h-4" />
                      <span>BEAR</span>
                      <span className="text-[10px] text-rose-500/80 font-mono ml-auto">
                        ({bearItems.length})
                      </span>
                    </div>

                    {bearItems.length === 0 ? (
                      <div className="p-4 rounded-lg bg-slate-950/40 border border-slate-800/50 text-center text-slate-500 text-xs">
                        ไม่มีหลักฐานฝั่ง BEAR ในหมวดนี้
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {bearItems.map((item, idx) => (
                          <EvidenceCard key={`${item.source_url}-${idx}`} item={item} currentSymbol={currentAsset.symbol} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Thesis Relation Section: 3 Boxes (List only, no scores) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* หนุน thesis */}
            <div className="bg-slate-900 border border-emerald-900/40 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">หนุน thesis</h3>
              </div>
              {validItems.filter(i => i.thesis_relation === 'supports').length === 0 ? (
                <p className="text-xs text-slate-500">ไม่มีหลักฐานที่ระบุว่าหนุน thesis</p>
              ) : (
                <div className="space-y-2">
                  {validItems.filter(i => i.thesis_relation === 'supports').map((item, idx) => (
                    <div key={idx} className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 text-xs space-y-1">
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="font-bold text-purple-300 font-mono">[{item.tier}]</span>
                        <span className="text-slate-300 font-medium">{item.source_name}</span>
                        <span className="text-slate-500 font-mono">{item.date}</span>
                      </div>
                      <p className="text-slate-200 text-[11px] leading-relaxed">{item.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ขัด thesis */}
            <div className="bg-slate-900 border border-rose-900/40 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider">ขัด thesis</h3>
              </div>
              {validItems.filter(i => i.thesis_relation === 'contradicts').length === 0 ? (
                <p className="text-xs text-slate-500">ไม่มีหลักฐานที่ระบุว่าขัด thesis</p>
              ) : (
                <div className="space-y-2">
                  {validItems.filter(i => i.thesis_relation === 'contradicts').map((item, idx) => (
                    <div key={idx} className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 text-xs space-y-1">
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="font-bold text-purple-300 font-mono">[{item.tier}]</span>
                        <span className="text-slate-300 font-medium">{item.source_name}</span>
                        <span className="text-slate-500 font-mono">{item.date}</span>
                      </div>
                      <p className="text-slate-200 text-[11px] leading-relaxed">{item.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ยังไม่ชัดว่าหนุนหรือขัด */}
            <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <HelpCircle className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">ยังไม่ชัดว่าหนุนหรือขัด</h3>
              </div>
              {validItems.filter(i => i.thesis_relation === 'unclear').length === 0 ? (
                <p className="text-xs text-slate-500">ไม่มีหลักฐานที่ยังไม่ชัดเจน</p>
              ) : (
                <div className="space-y-2">
                  {validItems.filter(i => i.thesis_relation === 'unclear').map((item, idx) => (
                    <div key={idx} className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 text-xs space-y-1">
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="font-bold text-purple-300 font-mono">[{item.tier}]</span>
                        <span className="text-slate-300 font-medium">{item.source_name}</span>
                        <span className="text-slate-500 font-mono">{item.date}</span>
                      </div>
                      <p className="text-slate-200 text-[11px] leading-relaxed">{item.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Grounding Sources Summary */}
          {groundingSources.length > 0 && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs">
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

// Sub-component for individual evidence card
const EvidenceCard: React.FC<{ item: EvidenceItem; currentSymbol: string }> = ({ item, currentSymbol }) => {
  const isBull = item.side === 'bull';

  return (
    <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3.5 shadow-sm hover:border-slate-700/80 transition-all text-xs space-y-2.5">
      {/* Top badges */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-800/60 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Side: BULL / BEAR */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] ${
              isBull
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
            }`}
          >
            {isBull ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {isBull ? 'BULL' : 'BEAR'}
          </span>

          {/* Tier with updated definitions */}
          <span
            className={`px-2 py-0.5 rounded-md font-bold text-[10px] cursor-help ${
              item.tier === 'T1'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                : item.tier === 'T2'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                : 'bg-slate-800 text-slate-400 border border-slate-700/60'
            }`}
            title={
              item.tier === 'T1'
                ? 'T1: ข้อมูลทางการ/positioning จริง (Fed, BLS, EIA, CFTC COT, CME FedWatch, ETF flow, on-chain, World Silver Institute)'
                : item.tier === 'T2'
                ? 'T2: สถาบัน/สำนักข่าวใหญ่ (Reuters, Bloomberg, CNBC, MarketWatch, Goldman Sachs, JPM, HSBC)'
                : 'T3: เว็บราคา/ชาร์ต (Investing.com, TradingView, Kitco, CoinGecko, FXStreet) / ความเห็นนักวิเคราะห์รายเดียว'
            }
          >
            Tier {item.tier}
          </span>

          {/* Label: FACT / INFER / SPEC */}
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

          {/* Verified Status */}
          {item.verified ? (
            <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              พบโดเมนนี้ในผลค้นหา
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-rose-400" />
              ไม่พบในผลค้นหาจริง — ตรวจเองก่อนใช้
            </span>
          )}
        </div>

        {/* Date */}
        <div className="flex items-center gap-1 text-slate-400 text-[11px] font-mono">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span>{item.date}</span>
        </div>
      </div>

      {/* Evidence Value */}
      <div className="text-slate-100 font-medium leading-relaxed text-[12px]">
        {item.value}
      </div>

      {/* Mechanism */}
      {item.mechanism && (
        <div className="bg-slate-900/80 rounded-lg p-2.5 border border-slate-800/80 text-[11px] text-slate-300 leading-relaxed">
          <span className="text-slate-400 font-semibold block text-[10px] uppercase mb-0.5">
            กลไกต่อ {currentSymbol} (Mechanism):
          </span>
          {item.mechanism}
        </div>
      )}

      {/* Source Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
        <div className="flex items-center gap-1.5 text-slate-400">
          <span>แหล่งข้อมูล:</span>
          <span className="font-semibold text-slate-200">{item.source_name}</span>
        </div>

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
  );
};
