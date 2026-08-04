import YAML from "yaml";
import { BRAIN_FILE_ID } from "./config.js";
import { fetchDriveFileById } from "./gmail.js";

// Loads the company rulebook (brain.yaml) from Drive and caches it. Phase 2:
// this ships "dark" — the /api/brain health endpoint reports what it can read
// and how stale it is, but nothing yet prices from it. Once Monday's refresh is
// verified to move modifiedTime, we wire the parsed rules into the prompt (and
// later the Phase 3 pricing/validator layer).

// The operating constants that are authoritative TODAY. brain.yaml may still
// disagree in a few places until Monday's refresh lands; these win on conflict.
export const AUTHORITATIVE = {
  labourSeniorPerHour: 105.0,
  labourApprenticePerHour: 75.0,
  certificatePrice: 26.0,
  mileageUrbanFlat: 30.0,
  mileageRuralPerKm: 2.0,
  sundriesCost: 5.0,
  sundriesSell: 20.0,
  materialsDivisor: 0.6,
  blendedGpFloor: 0.3,
  gstRate: 0.15,
};

interface BrainCache {
  raw: string;
  parsed: any;
  modifiedTime: string;
  fetchedAt: number;
  account: string;
}

const TTL_MS = 60 * 60 * 1000; // 60 minutes
const STALE_WARN_DAYS = 10;

let cache: BrainCache | null = null;

export interface BrainStatus {
  ok: boolean;
  error?: string;
  modifiedTime?: string;
  ageDays?: number;
  stale?: boolean;
  fromAccount?: string;
  topLevelKeys?: string[];
  fetchedAt?: string;
}

export async function getBrain(force = false): Promise<BrainStatus> {
  try {
    if (!force && cache && Date.now() - cache.fetchedAt < TTL_MS) {
      return status(cache);
    }
    const file = await fetchDriveFileById(BRAIN_FILE_ID);
    // If we already have this exact version, just refresh the timer.
    if (cache && cache.modifiedTime === file.modifiedTime && !force) {
      cache.fetchedAt = Date.now();
      return status(cache);
    }
    const raw = file.buffer.toString("utf8");
    const parsed = YAML.parse(raw);
    cache = {
      raw,
      parsed,
      modifiedTime: file.modifiedTime,
      fetchedAt: Date.now(),
      account: file.account,
    };
    const s = status(cache);
    if (s.stale) {
      console.warn(`brain.yaml is ${s.ageDays}d old (modifiedTime ${s.modifiedTime}) — refresh may have stalled.`);
    }
    return s;
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

// The last successfully-parsed rulebook, or null. Read-only accessor for later
// phases (prompt injection / pricing) — never throws.
export function currentBrain(): any | null {
  return cache?.parsed ?? null;
}

function status(c: BrainCache): BrainStatus {
  const ageDays = ageInDays(c.modifiedTime);
  return {
    ok: true,
    modifiedTime: c.modifiedTime,
    ageDays: ageDays ?? undefined,
    stale: ageDays != null && ageDays > STALE_WARN_DAYS,
    fromAccount: c.account,
    topLevelKeys: c.parsed && typeof c.parsed === "object" ? Object.keys(c.parsed) : [],
    fetchedAt: new Date(c.fetchedAt).toISOString(),
  };
}

function ageInDays(modifiedTime: string): number | null {
  const t = Date.parse(modifiedTime);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}
