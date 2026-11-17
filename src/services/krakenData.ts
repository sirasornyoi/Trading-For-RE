import { Candle, Timeframe } from '../types/trading';

const KRAKEN_WS_INTERVAL_MINUTES: Record<Timeframe, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '4h': 240,
  '1d': 1440,
  '1w': 10080,
};

const USDT_TO_USD_MIGRATION_FLAG = 'apextrade_migrated_usdt_to_usd_v1';

function mapUsdtSymbol(symbol: string): string {
  if (symbol.endsWith('/USDT')) {
    return `${symbol.slice(0, -5)}/USD`;
  }
  return symbol;
}

export function migrateUsdtToUsdStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (localStorage.getItem(USDT_TO_USD_MIGRATION_FLAG) === '1') return;

    // 1. Migrate Price Alerts (apextrade_alerts_v2)
    const alertsRaw = localStorage.getItem('apextrade_alerts_v2');
    if (alertsRaw) {
      try {
        const parsedAlerts = JSON.parse(alertsRaw);
        if (Array.isArray(parsedAlerts)) {
          const migratedAlerts = parsedAlerts.map(a =>
            a && typeof a === 'object' && typeof a.symbol === 'string'
              ? { ...a, symbol: mapUsdtSymbol(a.symbol) }
              : a
          );
          localStorage.setItem('apextrade_alerts_v2', JSON.stringify(migratedAlerts));
        }
      } catch {}
    }

    // 2. Migrate Breakout Scalp configs (apextrade_breakout_scalp_configs_v1)
    const scalpRaw = localStorage.getItem('apextrade_breakout_scalp_configs_v1');
    if (scalpRaw) {
      try {
        const parsedScalp = JSON.parse(scalpRaw);
        if (parsedScalp && typeof parsedScalp === 'object' && !Array.isArray(parsedScalp)) {
          const migratedScalp: Record<string, any> = {};
          // Preserve existing non-USDT keys first
          for (const [k, v] of Object.entries(parsedScalp)) {
            if (!k.endsWith('/USDT')) {
              const entry: Record<string, any> | null =
                v && typeof v === 'object' ? { ...(v as Record<string, any>) } : null;
              if (entry && entry.source === 'Binance') {
                entry.source = 'Kraken';
              }
              migratedScalp[k] = entry ?? v;
            }
          }
          // Move xxx/USDT -> xxx/USD if not already populated
          for (const [k, v] of Object.entries(parsedScalp)) {
            if (k.endsWith('/USDT')) {
              const newKey = mapUsdtSymbol(k);
              if (!(newKey in migratedScalp)) {
                const entry: Record<string, any> =
                  v && typeof v === 'object' ? { ...(v as Record<string, any>) } : {};
                entry.symbol = newKey;
                if (entry.source === 'Binance' || !entry.source) {
                  entry.source = 'Kraken';
                }
                migratedScalp[newKey] = entry;
              }
            }
          }
          localStorage.setItem('apextrade_breakout_scalp_configs_v1', JSON.stringify(migratedScalp));
        }
      } catch {}
    }

    // 3. Migrate Entry Tiers state (apextrade_entry_tiers_v1)
    const tiersRaw = localStorage.getItem('apextrade_entry_tiers_v1');
    if (tiersRaw) {
      try {
        const parsedTiers = JSON.parse(tiersRaw);
        if (parsedTiers && typeof parsedTiers === 'object' && !Array.isArray(parsedTiers)) {
          const migratedTiers: Record<string, any> = {};
          for (const [k, v] of Object.entries(parsedTiers)) {
            if (!k.endsWith('/USDT')) {
              migratedTiers[k] = v;
            }
          }
          for (const [k, v] of Object.entries(parsedTiers)) {
            if (k.endsWith('/USDT')) {
              const newKey = mapUsdtSymbol(k);
              if (!(newKey in migratedTiers)) {
                migratedTiers[newKey] = v;
              }
            }
          }
          localStorage.setItem('apextrade_entry_tiers_v1', JSON.stringify(migratedTiers));
        }
      } catch {}
    }

    // 4. Migrate stored CSV candles (candles_<symbol>)
    const keysToMigrate: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('candles_') && key.endsWith('/USDT')) {
        keysToMigrate.push(key);
      }
    }
    for (const oldKey of keysToMigrate) {
      const oldSym = oldKey.slice('candles_'.length);
      const newKey = `candles_${mapUsdtSymbol(oldSym)}`;
      const val = localStorage.getItem(oldKey);
      if (val !== null && localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, val);
      }
      localStorage.removeItem(oldKey);
    }

    localStorage.setItem(USDT_TO_USD_MIGRATION_FLAG, '1');
  } catch {}
}

// Fetch historical + current OHLC candles via backend Kraken proxy
export async function fetchKrakenKlines(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  const res = await fetch(
    `/api/kraken/ohlc?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`
  );
  if (!res.ok) {
    let errMsg = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) errMsg = body.error;
    } catch {}
    throw new Error(`Failed to fetch Kraken OHLC: ${errMsg}`);
  }
  const data = await res.json();
  return Array.isArray(data?.candles) ? data.candles : [];
}

// Subscribe to live Kraken WebSocket v2 OHLC stream
export function subscribeKrakenOhlc(
  symbol: string,
  timeframe: Timeframe,
  onCandle: (candle: Candle, isSnapshot: boolean) => void,
  onStatusChange?: (connected: boolean) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const interval = KRAKEN_WS_INTERVAL_MINUTES[timeframe] || 15;
  let ws: WebSocket | null = null;
  let isClosed = false;

  try {
    ws = new WebSocket('wss://ws.kraken.com/v2');

    ws.onopen = () => {
      if (isClosed || !ws) return;
      onStatusChange?.(true);
      try {
        ws.send(
          JSON.stringify({
            method: 'subscribe',
            params: {
              channel: 'ohlc',
              symbol: [symbol],
              interval,
            },
          })
        );
      } catch {}
    };

    ws.onmessage = (event) => {
      if (isClosed) return;
      try {
        const msg = JSON.parse(event.data);
        if (
          msg &&
          msg.channel === 'ohlc' &&
          (msg.type === 'snapshot' || msg.type === 'update') &&
          Array.isArray(msg.data)
        ) {
          const isSnapshot = msg.type === 'snapshot';
          for (const item of msg.data) {
            if (!item || typeof item.interval_begin !== 'string') continue;
            if (item.symbol && item.symbol !== symbol) continue;

            const parsedMs = Date.parse(item.interval_begin);
            if (isNaN(parsedMs)) continue;
            const time = Math.floor(parsedMs / 1000);
            const open = Number(item.open);
            const high = Number(item.high);
            const low = Number(item.low);
            const close = Number(item.close);
            const volume = Number(item.volume);

            if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) continue;

            onCandle(
              {
                time,
                open,
                high,
                low,
                close,
                volume: isNaN(volume) ? 0 : volume,
              },
              isSnapshot
            );
          }
        }
      } catch {}
    };

    ws.onerror = () => {
      if (!isClosed) onStatusChange?.(false);
    };

    ws.onclose = () => {
      if (!isClosed) onStatusChange?.(false);
    };
  } catch {
    if (!isClosed) onStatusChange?.(false);
  }

  return () => {
    isClosed = true;
    if (ws) {
      try {
        ws.close();
      } catch {}
    }
  };
}
