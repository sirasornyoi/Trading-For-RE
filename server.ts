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

      // Requirement 3: drop any item without source_url or date before returning
      const validItems = rawItems
        .filter(item => {
          return (
            item &&
            typeof item.source_url === 'string' &&
            item.source_url.trim().length > 0 &&
            item.source_url.startsWith('http') &&
            typeof item.date === 'string' &&
            item.date.trim().length > 0
          );
        })
        .map(item => {
          const isFact = item.label === 'FACT';
          return {
            layer: ['Fundamental', 'Technical', 'News'].includes(item.layer) ? item.layer : 'Fundamental',
            side: item.side === 'bear' ? 'bear' : 'bull',
            label: ['FACT', 'INFER', 'SPEC'].includes(item.label) ? item.label : (isFact ? 'FACT' : 'INFER'),
            tier: ['T1', 'T2', 'T3'].includes(item.tier) ? item.tier : 'T2',
            value: String(item.value || ''),
            source_name: String(item.source_name || 'Market Source'),
            source_url: String(item.source_url),
            date: String(item.date),
            mechanism: String(item.mechanism || ''),
            side_basis: isFact ? 'self-evident' : 'placed by model',
          };
        });

      return res.json({ items: validItems });
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
