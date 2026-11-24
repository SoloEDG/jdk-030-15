import {
  canonicalizeWithLinks,
  initialSnapshot,
  methodFingerprint,
  replay,
  type SwapLink,
} from "./trace";
import type {
  LevelRecord,
  MethodRecord,
  PushTrace,
  RuntimeLevel,
} from "@/shared/types";

export interface MethodCommit {
  record: LevelRecord;
  fingerprint: string;
  matched: boolean;
  improved: boolean;
  links: SwapLink[];
}

/** 校验推迹能否在该关卡上从初始局面完整重放。 */
export function traceIsReplayable(level: RuntimeLevel, trace: PushTrace[]): boolean {
  return replay(level, initialSnapshot(level), trace) != null;
}

/**
 * 识别一条通关推迹属于哪种工法，并把成绩按工法入账。
 * 同指纹即同一工法，只保留实走步数最少的一条；推迹随最少步数的那条保存。
 */
export function commitMethodRecord(
  level: RuntimeLevel,
  current: LevelRecord | undefined,
  trace: PushTrace[],
  steps: number,
  at: number,
): MethodCommit {
  const initial = initialSnapshot(level);
  const { canonical, links } = canonicalizeWithLinks(level, initial, trace);
  const fingerprint = methodFingerprint(level, initial, canonical);
  const methods = current?.methods ? current.methods.map((item) => ({ ...item, trace: item.trace?.map((p) => ({ ...p })) })) : [];
  const existing = methods.find((item) => item.fingerprint === fingerprint);
  let matched = false;
  let improved = false;

  if (existing) {
    matched = true;
    if (steps < existing.bestSteps) {
      existing.bestSteps = steps;
      existing.bestPushes = trace.length;
      existing.clearedAt = at;
      existing.trace = trace.map((item) => ({ ...item }));
      improved = true;
    }
  } else {
    methods.push({
      fingerprint,
      bestSteps: steps,
      bestPushes: trace.length,
      clearedAt: at,
      trace: trace.map((item) => ({ ...item })),
    });
    improved = true;
  }

  methods.sort((a, b) => a.bestSteps - b.bestSteps || a.fingerprint.localeCompare(b.fingerprint));
  const bestSteps = Math.min(current?.bestSteps ?? Number.POSITIVE_INFINITY, steps);
  const record: LevelRecord = {
    bestSteps,
    clearedAt: current && current.bestSteps <= steps ? current.clearedAt : at,
    methods,
  };
  return { record, fingerprint, matched, improved, links };
}

/** 账页展示用：把关卡记录整理成行；没有推迹的老成绩只列数值，不猜工法。 */
export interface MethodRow {
  fingerprint: string;
  bestSteps: number;
  bestPushes: number;
  clearedAt: number;
  hasTrace: boolean;
  trace: PushTrace[];
  legacy: boolean;
}

export function methodRows(record: LevelRecord | undefined): MethodRow[] {
  if (!record) return [];
  const rows: MethodRow[] = (record.methods ?? []).map((item: MethodRecord) => ({
    fingerprint: item.fingerprint,
    bestSteps: item.bestSteps,
    bestPushes: item.bestPushes,
    clearedAt: item.clearedAt,
    hasTrace: Array.isArray(item.trace) && item.trace.length > 0,
    trace: (item.trace ?? []).map((p) => ({ ...p })),
    legacy: false,
  }));
  const tracedSteps = new Set(rows.map((row) => row.bestSteps));
  // 老版本只留下数值、没有推迹：单独列一行，不猜测它属于哪种工法。
  if (!record.methods || record.methods.length === 0 || !tracedSteps.has(record.bestSteps)) {
    rows.push({
      fingerprint: "legacy",
      bestSteps: record.bestSteps,
      bestPushes: 0,
      clearedAt: record.clearedAt,
      hasTrace: false,
      trace: [],
      legacy: true,
    });
  }
  return rows.sort((a, b) => a.bestSteps - b.bestSteps);
}
