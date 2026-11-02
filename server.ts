import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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

    if (timeframe === '15m') {
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
