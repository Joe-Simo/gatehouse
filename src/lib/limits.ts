import "server-only";
import { createHash } from "node:crypto";

// The demo spends real credits, so it is careful with them: a small per-visitor
// budget and a short cache, both in memory on each instance.

const WINDOW_MS = 10 * 60_000;
const PER_WINDOW = 10;
const hits = new Map<string, number[]>();

export function allow(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= PER_WINDOW) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5_000) hits.delete(hits.keys().next().value as string);
  return true;
}

const CACHE_MAX = 200;
const CACHE_MS = 60 * 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

export function cacheKey(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function cached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at > CACHE_MS) return null;
  return hit.value as T;
}

export function remember(key: string, value: unknown): void {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}
