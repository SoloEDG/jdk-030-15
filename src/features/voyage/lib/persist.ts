import type { LevelRecord, MethodRecord, PushTrace, Vec } from "@/shared/types";

export const STORAGE_KEY = "jdk-030.voyage.v2";
const LEGACY_STORAGE_KEY = "jdk-030.voyage.v1";

export interface VoyageSave {
  version: 2;
  currentLevelId: string;
  records: Record<string, LevelRecord>;
}

function isVec(value: unknown): value is Vec {
  return !!value && typeof value === "object"
    && typeof (value as Vec).x === "number"
    && typeof (value as Vec).y === "number";
}

function isPushTrace(value: unknown): value is PushTrace {
  if (!value || typeof value !== "object") return false;
  const t = value as Record<string, unknown>;
  return typeof t.boxId === "string"
    && (t.kind === "timber" || t.kind === "iron" || t.kind === "glass")
    && (t.dir === "n" || t.dir === "e" || t.dir === "s" || t.dir === "w")
    && isVec(t.from) && isVec(t.to) && isVec(t.playerBefore) && isVec(t.playerAfter)
    && !!t.doorsAfter && typeof t.doorsAfter === "object"
    && !!t.floorsAfter && typeof t.floorsAfter === "object";
}

function isMethodRecord(value: unknown): value is MethodRecord {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  if (typeof m.fingerprint !== "string"
    || !Number.isSafeInteger(m.bestSteps) || (m.bestSteps as number) <= 0
    || !Number.isSafeInteger(m.bestPushes) || (m.bestPushes as number) <= 0
    || !Number.isFinite(m.clearedAt)) {
    return false;
  }
  if (m.trace !== undefined) {
    if (!Array.isArray(m.trace) || !m.trace.every(isPushTrace)) return false;
  }
  return true;
}

function isLevelRecord(value: unknown): value is LevelRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  if (!Number.isSafeInteger(r.bestSteps) || (r.bestSteps as number) <= 0) return false;
  if (!Number.isFinite(r.clearedAt) || !Number.isFinite(new Date(r.clearedAt as number).getTime())) return false;
  if (r.methods !== undefined) {
    if (!Array.isArray(r.methods) || !r.methods.every(isMethodRecord)) return false;
  }
  return true;
}

function sanitizeRecords(raw: unknown): Record<string, LevelRecord> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(([, record]) => isLevelRecord(record))
      .map(([id, record]) => [id, record as LevelRecord]),
  );
}

/** 老版本存档只有 bestSteps 数值、没有推迹：原样迁入，账页只列数值，不猜工法。 */
function readLegacySave(): { currentLevelId: string; records: Record<string, LevelRecord> } | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      version?: number;
      currentLevelId?: unknown;
      records?: Record<string, { bestSteps?: unknown; clearedAt?: unknown }>;
    };
    if (parsed.version !== 1 || typeof parsed.currentLevelId !== "string") return null;
    const records: Record<string, LevelRecord> = {};
    for (const [id, entry] of Object.entries(parsed.records ?? {})) {
      if (!entry || !Number.isSafeInteger(entry.bestSteps) || (entry.bestSteps as number) <= 0) continue;
      if (!Number.isFinite(entry.clearedAt)) continue;
      records[id] = { bestSteps: entry.bestSteps as number, clearedAt: entry.clearedAt as number };
    }
    return { currentLevelId: parsed.currentLevelId, records };
  } catch {
    return null;
  }
}

export function readSave(): VoyageSave | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as VoyageSave;
      if (parsed.version !== 2 || typeof parsed.currentLevelId !== "string") return null;
      return { version: 2, currentLevelId: parsed.currentLevelId, records: sanitizeRecords(parsed.records) };
    }
    const legacy = readLegacySave();
    if (legacy) {
      return { version: 2, currentLevelId: legacy.currentLevelId, records: legacy.records };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeSave(save: VoyageSave): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
}
