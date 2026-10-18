import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json());

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const SYSTEM_INSTRUCTION = `You are a market-evidence analyst supporting a trader who has his own thesis and reads charts himself. Your job is to find and verify evidence that supports or contradicts his thesis — never to decide for him. Report what the market is pricing in and what credible sources say, citing name + date. Prioritize T1 smart-money/official data (CFTC COT, CME FedWatch, Fed, BLS, EIA, ETF flow), then consensus of major institutions (T2: Reuters, Bloomberg, CNBC, major banks); treat single voices as low weight and say so. Label every statement FACT / INFER / SPEC. Never invent numbers; if a figure can't be verified say 'ไม่พบข้อมูลที่ verify ได้'. Every macro item must state its effect on the selected asset. Never output buy/sell/wait/avoid or a bull-vs-bear verdict. Respond in Thai.`;

  // Task 4a — POST /api/analyze with Google Search grounding
  app.post('/api/analyze', async (req, res) => {
    try {
      const { symbol, assetName, thesis } = req.body;
      if (!symbol || !thesis) {
        return res.status(400).json({ error: 'Missing symbol or thesis' });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on server' });
      }

      const prompt = `Analyze the market evidence for asset: ${assetName || symbol} (${symbol}).
Trader's Thesis: "${thesis}"

Search for the latest real-time market data, institutional positioning, economic indicators, and news using Google Search.
You must return a JSON array of evidence items.
Each item must strictly contain:
- layer: "Fundamental" | "Technical" | "News"
- side: "bull" | "bear"
- label: "FACT" | "INFER" | "SPEC"
- tier: "T1" | "T2" | "T3"
- value: string (concise verified evidence or statement)
- source_name: string (name of source, e.g. "CFTC", "CME FedWatch", "Reuters", "Bloomberg", "Fed", "BLS")
- source_url: string (direct URL from Google Search results. MUST be a valid http/https link)
- date: string (date of data or publication, e.g. "2026-10-18")
- mechanism: string (specific transmission mechanism explaining the impact on ${symbol})
- side_basis: "self-evident" if label is FACT, or "placed by model" if label is INFER or SPEC.

Output ONLY a valid JSON array without markdown ticks or additional commentary.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ googleSearch: {} }],
        },
      });

      const candidate = response.candidates?.[0];
      const groundingMetadata = candidate?.groundingMetadata;
      const groundingChunks: any[] = groundingMetadata?.groundingChunks || [];

      const extractDomain = (urlStr: string): string => {
        try {
          const u = new URL(urlStr);
          return u.hostname.replace(/^www\./, '').toLowerCase();
        } catch {
          return '';
        }
      };

      const matchDomains = (d1: string, d2: string): boolean => {
        if (!d1 || !d2) return false;
        if (d1 === d2) return true;
        if (d1.endsWith('.' + d2) || d2.endsWith('.' + d1)) return true;
        return false;
      };

      const groundingSources: { title: string; url: string; domain: string }[] = [];
      for (const chunk of groundingChunks) {
        const uri = chunk?.web?.uri;
        const title = chunk?.web?.title || '';
        if (typeof uri === 'string' && uri.startsWith('http')) {
          groundingSources.push({
            title,
            url: uri,
            domain: extractDomain(uri),
          });
        }
      }

      let rawItems: any[] = [];
      const text = response.text || '';
      try {
        const clean = text.replace(/```json\s*|\s*```/g, '').trim();
        rawItems = JSON.parse(clean);
      } catch {
        const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (match) {
          try {
            rawItems = JSON.parse(match[0]);
          } catch {}
        }
      }

      if (!Array.isArray(rawItems)) {
        rawItems = [];
      }

      const ALLOWED_LAYERS = new Set(['Fundamental', 'Technical', 'News']);
      const ALLOWED_SIDES = new Set(['bull', 'bear']);
      const ALLOWED_LABELS = new Set(['FACT', 'INFER', 'SPEC']);
      const ALLOWED_TIERS = new Set(['T1', 'T2', 'T3']);

      // 1. Validation: DROP any item whose layer, side, label or tier is not one of the allowed values.
      // Never fill in defaults. Also drop items without source_url or date.
      const validItems = rawItems
        .filter(item => {
          if (!item || typeof item !== 'object') return false;
          if (!ALLOWED_LAYERS.has(item.layer)) return false;
          if (!ALLOWED_SIDES.has(item.side)) return false;
          if (!ALLOWED_LABELS.has(item.label)) return false;
          if (!ALLOWED_TIERS.has(item.tier)) return false;
          if (typeof item.source_url !== 'string' || !item.source_url.trim().startsWith('http')) return false;
          if (typeof item.date !== 'string' || !item.date.trim()) return false;
          return true;
        })
        .map(item => {
          const itemDomain = extractDomain(item.source_url);
          const isVerified = groundingSources.some(gs => matchDomains(itemDomain, gs.domain));
          return {
            layer: item.layer,
            side: item.side,
            label: item.label,
            tier: item.tier,
            value: String(item.value || ''),
            source_name: String(item.source_name || ''),
            source_url: String(item.source_url),
            date: String(item.date),
            mechanism: String(item.mechanism || ''),
            side_basis: item.label === 'FACT' ? 'self-evident' : 'placed by model',
            verified: isVerified,
          };
        });

      return res.json({
        items: validItems,
        groundingSources: groundingSources.map(s => ({ title: s.title, url: s.url })),
      });
    } catch (err: any) {
      console.error('API /api/analyze error:', err);
      return res.status(500).json({ error: err.message || 'Analysis failed' });
    }
  });

  // Mount Vite in development or static in production
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const port = 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
