import type { EngineConfig } from '../types';

const QUERY_KEY = 'tension';

function isValidConfig(value: unknown): value is EngineConfig {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.magnitudeThreshold === 'number' &&
    Number.isFinite(p.magnitudeThreshold) &&
    p.magnitudeThreshold >= 2.5 &&
    p.magnitudeThreshold <= 7.5
  );
}

/** Resolved engine config -> URL-safe encoded string. Round-trips through decodeShareParams. */
export function encodeShareParams(params: EngineConfig): string {
  return encodeURIComponent(btoa(JSON.stringify(params)));
}

/** Untrusted URL input -> EngineConfig, or null if malformed/tampered/incomplete. Never throws. */
export function decodeShareParams(encoded: string): EngineConfig | null {
  try {
    const parsed = JSON.parse(atob(decodeURIComponent(encoded)));
    return isValidConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Current page URL with the resolved engine config encoded into a `tension` query param, everything else stripped. */
export function buildShareUrl(params: EngineConfig): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set(QUERY_KEY, encodeShareParams(params));
  return url.toString();
}

/** Reads and decodes the `tension` param from the current page URL, if present and valid. */
export function readShareParamsFromLocation(): EngineConfig | null {
  const value = new URLSearchParams(window.location.search).get(QUERY_KEY);
  return value ? decodeShareParams(value) : null;
}
