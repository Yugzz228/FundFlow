import { formatEther, parseEther } from "ethers";

export function shortAddress(address: string): string {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
}

export function shortHash(hash: string): string {
  return hash ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : "";
}

/** Formats wei as ETH by trimming the decimal string; values never pass through a float. */
export function formatEth(wei: bigint, maxDecimals = 4): string {
  const [whole, fraction = ""] = formatEther(wei).split(".");
  const trimmed = fraction.slice(0, maxDecimals).replace(/0+$/, "");
  const wholeGrouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (trimmed) return `${wholeGrouped}.${trimmed}`;
  if (wei > 0n && whole === "0") return `<0.${"0".repeat(maxDecimals - 1)}1`;
  return wholeGrouped;
}

/** Parses user input into wei. Returns null for anything that is not a positive-or-zero decimal ETH amount. */
export function parseEthInput(value: string): bigint | null {
  const text = value.trim();
  if (!/^\d*\.?\d+$|^\d+\.$/.test(text)) return null;
  try {
    return parseEther(text.endsWith(".") ? text.slice(0, -1) : text);
  } catch {
    return null;
  }
}

/** Parses "33.33" into 3333 basis points using only the digits, so no float is ever involved. */
export function parsePercentToBps(value: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

export function formatBps(bps: number): string {
  const whole = Math.floor(bps / 100);
  const fraction = bps % 100;
  if (fraction === 0) return `${whole}%`;
  return `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}%`;
}

/** Progress as whole basis points, using integer arithmetic on wei. */
export function progressBps(raised: bigint, target: bigint): number {
  if (target === 0n) return 0;
  return Number((raised * 10_000n) / target);
}

export function formatDateTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

const DEMO_PREFIX = "[Local demo] ";

/** Seeded campaigns carry a title prefix on-chain; the UI turns that into a visible label. */
export function splitDemoTitle(title: string): { title: string; isDemo: boolean } {
  return title.startsWith(DEMO_PREFIX) ? { title: title.slice(DEMO_PREFIX.length), isDemo: true } : { title, isDemo: false };
}

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}
