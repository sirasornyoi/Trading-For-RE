import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

const ai = new GoogleGenAI();

function domainOf(urlStr: string): string {
  if (!urlStr) return '';
  try {
    const full = urlStr.startsWith('http://') || urlStr.startsWith('https://') ? urlStr : `https://${urlStr}`;
    const u = new URL(full);
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function isGoogleDomain(dom: string): boolean {
  if (!dom) return false;
  const d = dom.toLowerCase();
  return d === 'vertexaisearch.cloud.google.com' || d === 'google.com' || d.endsWith('.google.com');
}

// API endpoint for AI Market Evidence Analysis with Google Search Grounding
app.post('/api/analyze', async (req, res) => {
  try {
    const { symbol, assetName, thesis } = req.body || {};
    if (!thesis || typeof thesis !== 'string') {
      return res.status(400).json({ error: 'Thesis is required' });
    }
    if (thesis.length > 1000) {
      return res.status(400).json({ error: 'Thesis must not exceed 1000 characters' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const prompt = `You are a financial market evidence researcher. Today is ${today}.
Asset: ${symbol || 'Unknown'} (${assetName || ''})
User Thesis: "${thesis}"

Rules:
1. Macro/flow data must be published within the last 30 days. All numerical data must explicitly state the "as of" date (เช่น ข้อมูล ณ วันที่ YYYY-MM-DD).
2. You must research and include evidence for all 4 required topics:
   (1) ราคาปัจจุบัน (Current Price)
   (2) Fed rate + 2Y/10Y yields
   (3) CPI ล่าสุด (Latest CPI)
   (4) ETF flow / Inventory ของ asset นั้น
   If any of these 4 topics cannot be found, include an item explicitly stating "ไม่พบข้อมูล" for that topic instead of guessing or fabricating numbers.
3. Tier definitions:
   - T1: ข้อมูลทางการ/positioning จริง (Fed, BLS, EIA, CFTC COT, CME FedWatch, ETF flow, on-chain, World Silver Institute)
   - T2: สถาบัน/สำนักข่าวใหญ่ (Reuters, Bloomberg, CNBC, MarketWatch, Goldman Sachs, JPM, HSBC)
   - T3: เว็บราคา/ชาร์ต (Investing.com, TradingView, Kitco, CoinGecko, FXStreet). If evidence is from a single analyst, commentary, or blog, classify as T3 and the value field must explicitly include "มุมเดี่ยว ไม่ใช่ฉันทามติ".
4. For each item, determine:
   - layer: "Fundamental" | "Technical" | "News"
   - side: "bull" | "bear" (market price direction)
   - thesis_relation: "supports" | "contradicts" | "unclear" (evaluate specifically against User Thesis: does this evidence support, contradict, or is it unclear relative to user thesis?)
   - label: "FACT" | "INFER" | "SPEC"
   - tier: "T1" | "T2" | "T3"
   - value: Thai language concise explanation of the finding (with as of date)
   - source_name: Name of the publishing source
   - source_url: Direct URL or domain of the source found
   - date: Date of the report or event in YYYY-MM-DD format
   - mechanism: Thai explanation of the economic mechanism impacting ${symbol}
   - side_basis: "self-evident" | "placed by model"
   - missing: true if this topic was not found ("ไม่พบข้อมูล"), false otherwise

Format your entire response as a valid JSON object with an "items" array:
\`\`\`json
{
  "items": [
    {
      "layer": "Fundamental",
      "side": "bull",
      "thesis_relation": "supports",
      "label": "FACT",
      "tier": "T1",
      "value": "...",
      "source_name": "...",
      "source_url": "https://...",
      "date": "YYYY-MM-DD",
      "mechanism": "...",
      "side_basis": "self-evident",
      "missing": false
    }
  ]
}
\`\`\``;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const groundingSources: { title: string; url: string }[] = [];
    for (const chunk of chunks) {
      if (chunk.web?.uri) {
        groundingSources.push({
          title: chunk.web.title || chunk.web.uri,
          url: chunk.web.uri,
        });
      }
    }

    let items: any[] = [];
    const text = response.text || '';
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const rawJson = match ? match[1].trim() : text.trim();

    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed.items)) {
        items = parsed.items;
      } else if (Array.isArray(parsed)) {
        items = parsed;
      }
    } catch (parseErr) {
      console.warn('Failed to parse Gemini output as JSON, attempting cleanup:', parseErr);
      const jsonStart = rawJson.indexOf('{');
      const jsonEnd = rawJson.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        try {
          const extracted = JSON.parse(rawJson.slice(jsonStart, jsonEnd + 1));
          items = extracted.items || [];
        } catch {}
      }
    }

    // Process items:
    // 1. Identify missing topics (value contains "ไม่พบข้อมูล" or missing: true)
    // 2. Google redirect domains (vertexaisearch, google.com) must always be verified = false
    // 3. Match item domain against g.title only (not g.url)
    // 4. If fallback grounding URL used: verified = true only if g.title contains domain matching source_name
    items = items.map(item => {
      const { verified: _discarded, ...rest } = item;
      const valStr = String(rest.value || '');
      const isMissing = Boolean(rest.missing === true || valStr.includes('ไม่พบข้อมูล'));

      let sourceUrl = (rest.source_url || '').trim();
      let isVerified = false;

      if (!sourceUrl) {
        if (rest.source_name) {
          const nameLower = rest.source_name.toLowerCase().trim();
          const found = groundingSources.find(g =>
            g.title && g.title.toLowerCase().includes(nameLower)
          );
          if (found) {
            sourceUrl = found.url;
            const titleLower = (found.title || '').toLowerCase();
            const nameDom = domainOf(rest.source_name);
            const matches = titleLower.includes(nameLower) || (nameDom && titleLower.includes(nameDom));
            isVerified = Boolean(matches);
          }
        }
      } else {
        const dom = domainOf(sourceUrl);
        if (isGoogleDomain(dom)) {
          isVerified = false;
        } else {
          // Check item domain against g.title ONLY (never g.url)
          isVerified = Boolean(
            dom && groundingSources.some(g => g.title && g.title.toLowerCase().includes(dom))
          );
        }
      }

      let thesisRelation: 'supports' | 'contradicts' | 'unclear' = 'unclear';
      if (rest.thesis_relation === 'supports') thesisRelation = 'supports';
      else if (rest.thesis_relation === 'contradicts') thesisRelation = 'contradicts';
      else thesisRelation = 'unclear';

      return {
        ...rest,
        missing: isMissing,
        thesis_relation: thesisRelation,
        source_url: sourceUrl,
        verified: isMissing ? false : isVerified,
      };
    });

    // Remove any items that lack a real source_url or date (no '#' fallback), but EXEMPT items where missing = true
    items = items.filter(item => {
      if (item.missing) return true;
      return Boolean(item.source_url && item.source_url !== '#' && item.date && String(item.date).trim());
    });

    return res.json({
      items,
      groundingSources,
    });
  } catch (err: any) {
    console.error('Gemini Analysis error:', err);
    return res.status(500).json({ error: err.message || 'Market analysis failed' });
  }
});

// API endpoint for fetching Silver/USD candles and quotes from Yahoo Finance
app.get('/api/klines', async (req, res) => {
  try {
    const symbolParam = (req.query.symbol as string) || 'XAG/USD';
    const timeframe = (req.query.timeframe as string) || '1d';

    // Map app symbol to Yahoo Finance ticker
    let yahooSymbol = 'SI=F'; // Default COMEX Silver in USD
    if (symbolParam === 'XAG/USD' || symbolParam === 'SI1!' || symbolParam.toUpperCase().includes('SILVER')) {
      yahooSymbol = 'SI=F';
    } else if (symbolParam === 'XAU/USD' || symbolParam === 'GC1!') {
      yahooSymbol = 'GC=F';
    }

    // Map timeframe to Yahoo Finance interval & range
    let interval = '1d';
    let range = '2y';

    if (timeframe === '1m') {
      interval = '1m';
      range = '5d';
    } else if (timeframe === '5m') {
      interval = '5m';
      range = '1mo';
    } else if (timeframe === '15m') {
      interval = '15m';
      range = '1mo';
    } else if (timeframe === '1h') {
      interval = '1h';
      range = '3mo';
    } else if (timeframe === '4h') {
      interval = '1h'; // Yahoo has no native 4h, fetch 1h
      range = '6mo';
    } else if (timeframe === '1d') {
      interval = '1d';
      range = '2y';
    } else if (timeframe === '1w' || timeframe === '1wk') {
      interval = '1wk';
      range = '5y';
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=${interval}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Yahoo Finance API error: ${response.statusText} (${response.status})`,
      });
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      return res.status(404).json({ error: 'No data returned for symbol ' + yahooSymbol });
    }

    const timestamps: number[] = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const opens: (number | null)[] = quote.open || [];
    const highs: (number | null)[] = quote.high || [];
    const lows: (number | null)[] = quote.low || [];
    const closes: (number | null)[] = quote.close || [];
    const volumes: (number | null)[] = quote.volume || [];

    const candles = [];
    for (let i = 0; i < timestamps.length; i++) {
      const o = opens[i];
      const h = highs[i];
      const l = lows[i];
      const c = closes[i];
      const v = volumes[i] ?? 0;
      const t = timestamps[i];

      if (o != null && h != null && l != null && c != null && !isNaN(o) && !isNaN(h) && !isNaN(l) && !isNaN(c)) {
        candles.push({
          time: t,
          open: Number(o.toFixed(3)),
          high: Number(h.toFixed(3)),
          low: Number(l.toFixed(3)),
          close: Number(c.toFixed(3)),
          volume: Math.round(v),
        });
      }
    }

    const meta = result.meta || {};
    return res.json({
      symbol: symbolParam,
      yahooSymbol,
      source: 'Yahoo Finance (COMEX)',
      regularMarketPrice: meta.regularMarketPrice ?? (candles.length > 0 ? candles[candles.length - 1].close : 0),
      chartPreviousClose: meta.chartPreviousClose,
      candles,
    });
  } catch (error: any) {
    console.error('Yahoo Finance proxy error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Serve frontend in dev (via Vite middleware) or in prod (via static dist)
async function start() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

start();
