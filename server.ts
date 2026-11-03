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

// API endpoint for AI Market Evidence Analysis with Google Search Grounding
app.post('/api/analyze', async (req, res) => {
  try {
    const { symbol, assetName, thesis } = req.body || {};
    if (!thesis || typeof thesis !== 'string') {
      return res.status(400).json({ error: 'Thesis is required' });
    }

    const prompt = `You are a financial market evidence researcher.
Asset: ${symbol || 'Unknown'} (${assetName || ''})
User Thesis: "${thesis}"

Task:
1. Search the web for current, factual market evidence, macroeconomic data (T1: CFTC COT, Fed, central banks, BLS), institutional consensus (T2: Bloomberg, Reuters, Goldman Sachs, etc.), or real-world drivers relating to this asset and thesis.
2. For each piece of evidence, determine:
   - layer: "Fundamental" | "Technical" | "News"
   - side: "bull" | "bear"
   - label: "FACT" | "INFER" | "SPEC"
   - tier: "T1" | "T2" | "T3"
   - value: Thai language concise explanation of the finding
   - source_name: Name of the publishing source
   - source_url: Direct URL or domain of the source found
   - date: Date of the report or event (YYYY-MM-DD or recent month)
   - mechanism: Thai explanation of the economic mechanism impacting the price of ${symbol}
   - side_basis: "self-evident" | "placed by model"
   - verified: true if from a verified source from search, false otherwise

Format your entire response as a valid JSON object with an "items" array:
\`\`\`json
{
  "items": [
    {
      "layer": "Fundamental",
      "side": "bull",
      "label": "FACT",
      "tier": "T1",
      "value": "...",
      "source_name": "...",
      "source_url": "https://...",
      "date": "2025-...",
      "mechanism": "...",
      "side_basis": "self-evident",
      "verified": true
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

    // Attach verified flag or augment source_url with search grounding if missing
    items = items.map(item => {
      const matchingGrounding = groundingSources.find(g => 
        (item.source_url && g.url.toLowerCase().includes(item.source_url.toLowerCase())) ||
        (item.source_name && g.title.toLowerCase().includes(item.source_name.toLowerCase()))
      );
      return {
        ...item,
        source_url: item.source_url || matchingGrounding?.url || '#',
        verified: matchingGrounding ? true : (item.verified ?? true),
      };
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
