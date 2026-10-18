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

      // Log one sample groundingChunk to the server console so user can inspect the real shape
      if (groundingChunks.length > 0) {
        console.log('Sample groundingChunk:', JSON.stringify(groundingChunks[0], null, 2));
      }

      // Helper to extract the main domain name before TLD (e.g. "reuters" from "reuters.com" or "uk.reuters.com")
      const extractMainName = (input: string): string => {
        if (!input || typeof input !== 'string') return '';
        let str = input.trim().toLowerCase();

        // If it starts with http:// or https://, parse hostname
        try {
          if (str.startsWith('http://') || str.startsWith('https://')) {
            const u = new URL(str);
            str = u.hostname;
          }
        } catch {
          // ignore parsing error, continue string cleanup
        }

        // Clean protocol, path, query, port
        str = str.replace(/^https?:\/\//i, '');
        str = str.split('/')[0].split('?')[0].split(':')[0].trim();

        // Strip site title suffixes if present (e.g. "Reuters - Latest..." -> "Reuters")
        str = str.split(/\s*[-|:]\s*/)[0].trim();

        // Strip leading www.
        str = str.replace(/^www\./, '');

        // If there are words or spaces, take first token
        if (str.includes(' ')) {
          str = str.split(' ')[0];
        }
        str = str.replace(/[^a-z0-9.-]/g, '');

        if (!str) return '';

        const parts = str.split('.').filter(Boolean);
        if (parts.length === 0) return '';
        if (parts.length === 1) return parts[0];

        // Handle two-part ccTLDs (e.g. .co.uk, .com.au, .co.jp, .org.uk, .gov.uk, .co.th)
        const TWO_PART_TLD_FIRST = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'go', 'or']);
        const lastPart = parts[parts.length - 1];
        const secondLast = parts[parts.length - 2];

        if (parts.length >= 3 && lastPart.length === 2 && TWO_PART_TLD_FIRST.has(secondLast)) {
          return parts[parts.length - 3];
        }

        // Standard: main domain is the second-to-last part (e.g. "reuters" from "reuters.com" or "uk.reuters.com")
        return parts[parts.length - 2];
      };

      const matchMainNames = (n1: string, n2: string): boolean => {
        if (!n1 || !n2) return false;
        if (n1 === n2) return true;
        const clean1 = n1.replace(/[^a-z0-9]/g, '');
        const clean2 = n2.replace(/[^a-z0-9]/g, '');
        return Boolean(clean1 && clean2 && clean1 === clean2);
      };

      const groundingSources: { title: string; url: string; mainName: string }[] = [];
      for (const chunk of groundingChunks) {
        const uri = chunk?.web?.uri;
        const rawDomain = chunk?.web?.domain;
        const rawTitle = chunk?.web?.title || '';
        const domainOrTitle = (typeof rawDomain === 'string' && rawDomain.trim())
          ? rawDomain.trim()
          : (typeof rawTitle === 'string' ? rawTitle.trim() : '');

        if (typeof uri === 'string' && uri.startsWith('http')) {
          groundingSources.push({
            title: rawTitle || domainOrTitle || uri,
            url: uri, // Keep web.uri as the clickable link
            mainName: extractMainName(domainOrTitle),
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
          const itemMainName = extractMainName(item.source_url);
          const isVerified = Boolean(itemMainName) && groundingSources.some(gs => matchMainNames(itemMainName, gs.mainName));
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
