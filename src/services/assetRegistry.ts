import { Asset, AssetCategory } from '../types/trading';

export type RegistryAssetSource = 'Kraken' | 'Yahoo' | 'CSV';

export interface RegistryAsset {
  symbol: string;
  name: string;
  thaiName: string;
  icon: string;
  unit: string;
  decimals: number;
  category: AssetCategory;
  source: RegistryAssetSource;
  providerSymbol: string; // Kraken: 'BTC/USD' / Yahoo: 'GC=F', 'NVDA' / CSV: ''
  showInMode1: boolean;
  showInMode2: boolean; // CSV must always be false
  scalpBuffer: number;
}

export const ASSET_REGISTRY_STORAGE_KEY = 'apextrade_asset_registry_v1';

export const DEFAULT_REGISTRY_ASSETS: RegistryAsset[] = [
  {
    symbol: 'BTC/USD',
    name: 'Bitcoin',
    thaiName: 'บิตคอยน์',
    icon: '₿',
    unit: 'USD',
    decimals: 2,
    category: 'crypto',
    source: 'Kraken',
    providerSymbol: 'BTC/USD',
    showInMode1: true,
    showInMode2: true,
    scalpBuffer: 5,
  },
  {
    symbol: 'ETH/USD',
    name: 'Ethereum',
    thaiName: 'อีเธอเรียม',
    icon: 'Ξ',
    unit: 'USD',
    decimals: 2,
    category: 'crypto',
    source: 'Kraken',
    providerSymbol: 'ETH/USD',
    showInMode1: true,
    showInMode2: true,
    scalpBuffer: 0.5,
  },
  {
    symbol: 'SOL/USD',
    name: 'Solana',
    thaiName: 'โซลานา',
    icon: '◎',
    unit: 'USD',
    decimals: 2,
    category: 'crypto',
    source: 'Kraken',
    providerSymbol: 'SOL/USD',
    showInMode1: true,
    showInMode2: true,
    scalpBuffer: 0.1,
  },
  {
    symbol: 'SI1!',
    name: 'Silver Futures',
    thaiName: 'ซิลเวอร์ฟิวเจอร์ส (COMEX)',
    icon: '🥈',
    unit: 'USD/oz',
    decimals: 3,
    category: 'commodity',
    source: 'Yahoo',
    providerSymbol: 'SI=F',
    showInMode1: true,
    showInMode2: false,
    scalpBuffer: 0.05,
  },
  {
    symbol: 'XAU/USD',
    name: 'Gold Spot',
    thaiName: 'ทองคำสปอต',
    icon: '🥇',
    unit: 'USD/oz',
    decimals: 2,
    category: 'commodity',
    source: 'Yahoo',
    providerSymbol: 'GC=F',
    showInMode1: true,
    showInMode2: true,
    scalpBuffer: 0.5,
  },
  {
    symbol: 'XAG/USD',
    name: 'Silver Spot',
    thaiName: 'โลหะเงิน',
    icon: '🥈',
    unit: 'USD/oz',
    decimals: 3,
    category: 'commodity',
    source: 'Yahoo',
    providerSymbol: 'SI=F',
    showInMode1: true,
    showInMode2: true,
    scalpBuffer: 0.05,
  },
  {
    symbol: 'WTI/USD',
    name: 'Crude Oil',
    thaiName: 'น้ำมันดิบ WTI',
    icon: '🛢️',
    unit: 'USD/bbl',
    decimals: 2,
    category: 'commodity',
    source: 'CSV',
    providerSymbol: '',
    showInMode1: true,
    showInMode2: false,
    scalpBuffer: 0.05,
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corp',
    thaiName: 'เอ็นวิเดีย',
    icon: '🟢',
    unit: 'USD',
    decimals: 2,
    category: 'stock',
    source: 'CSV',
    providerSymbol: '',
    showInMode1: true,
    showInMode2: false,
    scalpBuffer: 0.05,
  },
  {
    symbol: 'TSLA',
    name: 'Tesla Inc',
    thaiName: 'เทสลา',
    icon: '⚡',
    unit: 'USD',
    decimals: 2,
    category: 'stock',
    source: 'CSV',
    providerSymbol: '',
    showInMode1: true,
    showInMode2: false,
    scalpBuffer: 0.05,
  },
  {
    symbol: 'AAPL',
    name: 'Apple Inc',
    thaiName: 'แอปเปิ้ล',
    icon: '🍎',
    unit: 'USD',
    decimals: 2,
    category: 'stock',
    source: 'CSV',
    providerSymbol: '',
    showInMode1: true,
    showInMode2: false,
    scalpBuffer: 0.05,
  },
];

function normalizeRegistryAsset(item: RegistryAsset): RegistryAsset {
  const source: RegistryAssetSource =
    item.source === 'Kraken' || item.source === 'Yahoo' || item.source === 'CSV'
      ? item.source
      : 'CSV';
  return {
    ...item,
    source,
    providerSymbol: source === 'CSV' ? '' : (item.providerSymbol || item.symbol),
    showInMode1: Boolean(item.showInMode1),
    showInMode2: source === 'CSV' ? false : Boolean(item.showInMode2),
    decimals: typeof item.decimals === 'number' && !isNaN(item.decimals) ? item.decimals : 2,
    scalpBuffer: typeof item.scalpBuffer === 'number' && !isNaN(item.scalpBuffer) ? item.scalpBuffer : 0.05,
  };
}

export function loadRegistry(): RegistryAsset[] {
  try {
    const raw = localStorage.getItem(ASSET_REGISTRY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(normalizeRegistryAsset);
      }
    }
  } catch {}
  return DEFAULT_REGISTRY_ASSETS.map(a => ({ ...a }));
}

export function saveRegistry(list: RegistryAsset[]): void {
  try {
    const normalized = list.map(normalizeRegistryAsset);
    localStorage.setItem(ASSET_REGISTRY_STORAGE_KEY, JSON.stringify(normalized));
  } catch {}
}

export function addAsset(asset: RegistryAsset): RegistryAsset[] {
  const current = loadRegistry();
  const normalizedSymbol = asset.symbol.trim();
  const exists = current.some(
    a => a.symbol.toUpperCase() === normalizedSymbol.toUpperCase()
  );
  if (exists) {
    throw new Error(`มีสินทรัพย์ ${normalizedSymbol} อยู่ในรายการแล้ว`);
  }
  const next = [...current, normalizeRegistryAsset({ ...asset, symbol: normalizedSymbol })];
  saveRegistry(next);
  return next;
}

export function purgeAssetLocalStorage(symbol: string): void {
  try {
    // 1. Price alerts
    const alertsRaw = localStorage.getItem('apextrade_alerts_v2');
    if (alertsRaw) {
      const parsedAlerts = JSON.parse(alertsRaw);
      if (Array.isArray(parsedAlerts)) {
        const filtered = parsedAlerts.filter((a: any) => a?.symbol !== symbol);
        localStorage.setItem('apextrade_alerts_v2', JSON.stringify(filtered));
      }
    }
  } catch {}

  try {
    // 2. Breakout Scalp configs
    const scalpRaw = localStorage.getItem('apextrade_breakout_scalp_configs_v1');
    if (scalpRaw) {
      const parsedScalp = JSON.parse(scalpRaw);
      if (parsedScalp && typeof parsedScalp === 'object') {
        delete parsedScalp[symbol];
        localStorage.setItem('apextrade_breakout_scalp_configs_v1', JSON.stringify(parsedScalp));
      }
    }
  } catch {}

  try {
    // 3. Entry Tiers state
    const tiersRaw = localStorage.getItem('apextrade_entry_tiers_v1');
    if (tiersRaw) {
      const parsedTiers = JSON.parse(tiersRaw);
      if (parsedTiers && typeof parsedTiers === 'object') {
        delete parsedTiers[symbol];
        localStorage.setItem('apextrade_entry_tiers_v1', JSON.stringify(parsedTiers));
      }
    }
  } catch {}

  try {
    // 4. Stored CSV candles
    localStorage.removeItem(`candles_${symbol}`);
  } catch {}
}

export function removeAsset(symbol: string): RegistryAsset[] {
  const current = loadRegistry();
  const next = current.filter(a => a.symbol !== symbol);
  if (next.filter(a => a.showInMode1).length === 0) {
    throw new Error('ต้องเหลือสินทรัพย์ในแบบที่ 1 อย่างน้อย 1 รายการ');
  }
  if (next.filter(a => a.showInMode2).length === 0) {
    throw new Error('ต้องเหลือสินทรัพย์ในแบบที่ 2 อย่างน้อย 1 รายการ');
  }
  saveRegistry(next);
  purgeAssetLocalStorage(symbol);
  return next;
}

export function resetRegistryToDefaults(): RegistryAsset[] {
  const defaults = DEFAULT_REGISTRY_ASSETS.map(a => ({ ...a }));
  saveRegistry(defaults);
  return defaults;
}

export function getAsset(symbol: string, list?: RegistryAsset[]): RegistryAsset | undefined {
  const items = list ?? loadRegistry();
  return items.find(a => a.symbol === symbol);
}

export function isKraken(symbol: string, list?: RegistryAsset[]): boolean {
  return getAsset(symbol, list)?.source === 'Kraken';
}

export function isYahoo(symbol: string, list?: RegistryAsset[]): boolean {
  return getAsset(symbol, list)?.source === 'Yahoo';
}

export function hasMarketClose(symbol: string, list?: RegistryAsset[]): boolean {
  return getAsset(symbol, list)?.source === 'Yahoo';
}

export function toMarketAsset(r: RegistryAsset): Asset {
  return {
    symbol: r.symbol,
    name: r.name,
    thaiName: r.thaiName,
    category: r.category,
    decimals: r.decimals,
    unit: r.unit,
    icon: r.icon,
  };
}
