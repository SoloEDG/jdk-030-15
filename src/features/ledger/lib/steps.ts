import { DIR_VEC } from "@/shared/types";
import type { Attempt, GameDocument, MoveResult, PushTrace } from "@/shared/types";

export function freshAttempt(): Attempt {
  return { steps: 0, pushes: 0, status: "playing", trace: [] };
}

export function countMove(document: GameDocument, result: MoveResult): boolean {
  if (!result.moved || document.attempt.status !== "playing") return false;
  document.attempt.steps += 1;
  return true;
}

/** 只给真正改变货位的推箱记一次推，并留下推迹（含这一推结算后的门/地板状态）。 */
export function registerPush(document: GameDocument, result: MoveResult, dir: PushTrace["dir"]): boolean {
  if (!result.pushed || !result.boxId || document.attempt.status !== "playing") return false;
  const box = document.level.boxes.find((item) => item.id === result.boxId);
  if (!box) return false;
  const delta = DIR_VEC[dir];
  const to = { x: box.x, y: box.y };
  const from = { x: to.x - delta.x, y: to.y - delta.y };
  const playerAfter = { ...document.level.player };
  const playerBefore = { x: from.x - delta.x, y: from.y - delta.y };
  const trace: PushTrace = {
    boxId: box.id,
    kind: box.kind,
    dir,
    from,
    to,
    playerBefore,
    playerAfter,
    doorsAfter: Object.fromEntries(document.level.doors.map((door) => [door.id, door.open])),
    floorsAfter: Object.fromEntries(document.level.floors.map((floor) => [floor.id, floor.active])),
  };
  document.attempt.pushes += 1;
  document.attempt.trace.push(trace);
  return true;
}

export function markCleared(document: GameDocument): boolean {
  if (document.attempt.status === "cleared") return false;
  document.attempt.status = "cleared";
  return true;
}
