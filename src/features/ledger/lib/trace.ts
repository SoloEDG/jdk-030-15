import { goalCells, inBounds } from "@/features/atlas/lib/grid";
import { describeBlock, isPassable } from "@/features/gadget/lib/passable";
import { evaluateGadgets } from "@/features/gadget/lib/power";
import { DIR_VEC, type Dir, type GameDocument, type PushTrace, type RuntimeLevel, type Vec } from "@/shared/types";

/** 一次推箱发生时、机关结算后的完整静态局面。 */
export interface Snapshot {
  boxes: { id: string; kind: PushTrace["kind"]; x: number; y: number }[];
  doors: Record<string, boolean>;
  floors: Record<string, boolean>;
}

/** 相邻两推能否交换的判定结果，含不可交换的中文原因。 */
export interface SwapVerdict {
  swappable: boolean;
  reason: string;
}

/** 两推交换判定所需的前置局面（含人的位置与可达区域）。 */
interface State {
  snapshot: Snapshot;
  player: Vec;
  reachable: Set<string>;
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function vecKey(vec: Vec): string {
  return cellKey(vec.x, vec.y);
}

/** 取关卡初始局面（hydrate 之后、任何移动之前的样子）。 */
export function initialSnapshot(level: RuntimeLevel): Snapshot {
  return {
    boxes: level.boxes.map((box) => ({ id: box.id, kind: box.kind, x: box.x, y: box.y })),
    doors: Object.fromEntries(level.doors.map((door) => [door.id, door.open])),
    floors: Object.fromEntries(level.floors.map((floor) => [floor.id, floor.active])),
  };
}

function snapshotOf(level: RuntimeLevel): Snapshot {
  return {
    boxes: level.boxes.map((box) => ({ id: box.id, kind: box.kind, x: box.x, y: box.y })),
    doors: Object.fromEntries(level.doors.map((door) => [door.id, door.open])),
    floors: Object.fromEntries(level.floors.map((floor) => [floor.id, floor.active])),
  };
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  if (a.boxes.length !== b.boxes.length) return false;
  const mapB = new Map(b.boxes.map((box) => [box.id, box]));
  for (const box of a.boxes) {
    const other = mapB.get(box.id);
    if (!other || other.x !== box.x || other.y !== box.y) return false;
  }
  return sameGadgets(a, b);
}

function sameGadgets(a: Snapshot, b: Snapshot): boolean {
  for (const [id, open] of Object.entries(a.doors)) {
    if (b.doors[id] !== open) return false;
  }
  for (const [id, active] of Object.entries(a.floors)) {
    if (b.floors[id] !== active) return false;
  }
  return true;
}

function sameRegion(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) {
    if (!b.has(key)) return false;
  }
  return true;
}

/**
 * 用一份关卡蓝图和局面快照，搭一个只供模拟的 GameDocument。
 * 不触碰真实文档；人的落点只是占位，可达性单独计算。
 */
function simDocument(level: RuntimeLevel, snapshot: Snapshot, player: Vec): GameDocument {
  return {
    version: 1,
    currentLevelId: level.id,
    level: {
      ...level,
      tiles: level.tiles,
      player: { ...player },
      boxes: snapshot.boxes.map((box) => ({ ...box })),
      plates: level.plates.map((plate) => ({ ...plate })),
      doors: level.doors.map((door) => ({
        id: door.id,
        x: door.x,
        y: door.y,
        open: snapshot.doors[door.id] ?? door.open,
      })),
      floors: level.floors.map((floor) => ({
        id: floor.id,
        x: floor.x,
        y: floor.y,
        morph: floor.morph,
        active: snapshot.floors[floor.id] ?? floor.active,
      })),
    },
    attempt: { steps: 0, pushes: 0, status: "playing", trace: [] },
    records: {},
  };
}

/**
 * 在指定模拟文档上执行一推并结算机关。
 * 人允许先靠不推箱的脚步绕到箱后（绕路不另算一种工法），
 * 所以这里只要求箱后格落在当前可达区域内，而不是人正好贴着箱子。
 * 走的是真实游戏同一套通行/机关规则；不合法时返回 null。
 */
function applyOne(level: RuntimeLevel, snapshot: Snapshot, player: Vec, trace: PushTrace): Snapshot | null {
  const delta = DIR_VEC[trace.dir];
  // 先在原局面里找到该箱，确认推迹起点与当前箱位一致、箱后可达、落点可推。
  const boxNow = snapshot.boxes.find((item) => item.id === trace.boxId);
  if (!boxNow) return null;
  if (boxNow.x !== trace.from.x || boxNow.y !== trace.from.y) return null;
  const behind = { x: boxNow.x - delta.x, y: boxNow.y - delta.y };
  const reachable = reachability(level, snapshot, player);
  if (!reachable.has(vecKey(behind))) return null;
  const doc = simDocument(level, snapshot, behind);
  const box = doc.level.boxes.find((item) => item.id === trace.boxId);
  if (!box) return null;
  const beyond = { x: box.x + delta.x, y: box.y + delta.y };
  if (!isPassable(doc, beyond, { ignoreBoxId: box.id, ignorePlayer: true })) return null;
  box.x = beyond.x;
  box.y = beyond.y;
  doc.level.player = { x: box.x - delta.x, y: box.y - delta.y };
  evaluateGadgets(doc);
  return snapshotOf(doc.level);
}

/** 人在当前箱位与机关下，靠不推箱的脚步能空走到的全部格子。 */
export function reachability(level: RuntimeLevel, snapshot: Snapshot, start: Vec): Set<string> {
  const doc = simDocument(level, snapshot, start);
  const seen = new Set<string>();
  const queue: Vec[] = [];
  if (!inBounds(doc.level, start.x, start.y)) return seen;
  if (!isPassable(doc, start, { ignorePlayer: true })) return seen;
  seen.add(vecKey(start));
  queue.push(start);
  const dirs: Dir[] = ["n", "e", "s", "w"];
  while (queue.length > 0) {
    const cur = queue.shift() as Vec;
    for (const dir of dirs) {
      const next = { x: cur.x + DIR_VEC[dir].x, y: cur.y + DIR_VEC[dir].y };
      const key = vecKey(next);
      if (seen.has(key)) continue;
      if (!isPassable(doc, next)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return seen;
}

function stateOf(level: RuntimeLevel, snapshot: Snapshot, player: Vec): State {
  return { snapshot, player, reachable: reachability(level, snapshot, player) };
}

/** 按推迹把局面逐步推到指定下标之后，返回当时的局面与人所在格。 */
function stateAfter(level: RuntimeLevel, initial: Snapshot, trace: PushTrace[], upto: number): State | null {
  let snapshot = initial;
  let player = level.player;
  for (let i = 0; i < upto; i += 1) {
    const next = applyOne(level, snapshot, player, trace[i]);
    if (!next) return null;
    player = { x: trace[i].to.x - DIR_VEC[trace[i].dir].x, y: trace[i].to.y - DIR_VEC[trace[i].dir].y };
    snapshot = next;
  }
  return stateOf(level, snapshot, player);
}

/** 从模拟文档读取某格当前为什么走不过去，用于不可交换原因说明。 */
function blockReason(level: RuntimeLevel, snapshot: Snapshot, player: Vec, at: Vec): string {
  const doc = simDocument(level, snapshot, player);
  return describeBlock(doc, at);
}

/**
 * 判定同一前置局面下两推 a、b 能否交换次序（ab 改 ba）。
 * 条件：两种次序各自都合法、每推自带的门与目标变化不变、
 * 两推全部结束后箱位与机关相同、人能空走到的区域相同。
 */
export function explainPair(level: RuntimeLevel, before: State, a: PushTrace, b: PushTrace): SwapVerdict {
  // 原次序：人从当前位置空走到 a 的箱后（绕路不推箱不算另一种工法）。
  const startA0 = { x: a.from.x - DIR_VEC[a.dir].x, y: a.from.y - DIR_VEC[a.dir].y };
  if (!before.reachable.has(vecKey(startA0))) {
    return {
      swappable: false,
      reason: `原次序下第 1 推（${a.kind}箱 → (${a.to.x},${a.to.y})）的箱后格（${startA0.x},${startA0.y}）走不到，这一推在当前局面本就不成立。`,
    };
  }
  const afterA = applyOne(level, before.snapshot, startA0, a);
  if (!afterA) {
    return { swappable: false, reason: `第 1 推在原次序里就不成立：${a.kind}箱推不向（${a.to.x},${a.to.y}）。` };
  }
  const playerA = { x: a.to.x - DIR_VEC[a.dir].x, y: a.to.y - DIR_VEC[a.dir].y };
  const doorsChangeA = gadgetsChanged(before.snapshot.doors, afterA.doors);
  const floorsChangeA = gadgetsChanged(before.snapshot.floors, afterA.floors);
  const goalsA = goalsDelta(level, before.snapshot, afterA);
  // 原次序第二推：人从 a 的落点空走到 b 的箱后。
  const startB0 = { x: b.from.x - DIR_VEC[b.dir].x, y: b.from.y - DIR_VEC[b.dir].y };
  const reachA = reachability(level, afterA, playerA);
  if (!reachA.has(vecKey(startB0))) {
    return {
      swappable: false,
      reason: `原次序下第 2 推（${b.kind}箱 → (${b.to.x},${b.to.y})）的箱后格走不到，第 1 推把路卡住了，换序无从比较。`,
    };
  }
  const afterAB = applyOne(level, afterA, startB0, b);
  if (!afterAB) {
    return { swappable: false, reason: `原次序下第 2 推（${b.kind}箱 → (${b.to.x},${b.to.y})）推不动，换序无从比较。` };
  }
  const playerAB = { x: b.to.x - DIR_VEC[b.dir].x, y: b.to.y - DIR_VEC[b.dir].y };
  const doorsChangeB = gadgetsChanged(afterA.doors, afterAB.doors);
  const floorsChangeB = gadgetsChanged(afterA.floors, afterAB.floors);
  const goalsB = goalsDelta(level, afterA, afterAB);

  // 换序：先 b。人能绕路走到箱后（不推箱的脚步不算另一种工法），只要求落在可达区域里。
  const startB1 = { x: b.from.x - DIR_VEC[b.dir].x, y: b.from.y - DIR_VEC[b.dir].y };
  if (!before.reachable.has(vecKey(startB1))) {
    return {
      swappable: false,
      reason: `换序后先推 ${b.kind}箱，但人在当前局面走不到箱后格（${startB1.x},${startB1.y}），中间隔着没打开的通路。`,
    };
  }
  const swappedB = applyOne(level, before.snapshot, startB1, b);
  if (!swappedB) {
    const why = blockReason(
      level,
      before.snapshot,
      startB1,
      { x: b.to.x, y: b.to.y },
    );
    return { swappable: false, reason: `换序后第 1 推（${b.kind}箱 → (${b.to.x},${b.to.y})）落不下去：${why}。` };
  }

  // 每推引起的门和目标变化仍归原来那一推：先验 b 的变化是否与原次序一致。
  const swapDoorsB = gadgetsChanged(before.snapshot.doors, swappedB.doors);
  const swapFloorsB = gadgetsChanged(before.snapshot.floors, swappedB.floors);
  if (!sameChange(doorsChangeB, swapDoorsB) || !sameChange(floorsChangeB, swapFloorsB)) {
    return {
      swappable: false,
      reason: "换序后这一推落地时门/地板的开关结果和原来不一致，机关变化不能挪给另一推。",
    };
  }
  const swapGoalsB = goalsDelta(level, before.snapshot, swappedB);
  if (!sameGoals(goalsB, swapGoalsB)) {
    return { swappable: false, reason: "换序后这一推造成的目标格占空变化与原来不一致，腾位与进位不能错位。" };
  }

  const playerBA = { x: b.to.x - DIR_VEC[b.dir].x, y: b.to.y - DIR_VEC[b.dir].y };
  const reachAfterB = reachability(level, swappedB, playerBA);
  const startA1 = { x: a.from.x - DIR_VEC[a.dir].x, y: a.from.y - DIR_VEC[a.dir].y };
  if (!reachAfterB.has(vecKey(startA1))) {
    return {
      swappable: false,
      reason: `换序后再推 ${a.kind}箱时，人走不到它的箱后格（${startA1.x},${startA1.y}）：先动的箱子或机关把路占了。`,
    };
  }
  const swappedBA = applyOne(level, swappedB, startA1, a);
  if (!swappedBA) {
    const why = blockReason(level, swappedB, startA1, { x: a.to.x, y: a.to.y });
    return { swappable: false, reason: `换序后第 2 推（${a.kind}箱 → (${a.to.x},${a.to.y})）落不下去：${why}。` };
  }
  const swapDoorsA = gadgetsChanged(swappedB.doors, swappedBA.doors);
  const swapFloorsA = gadgetsChanged(swappedB.floors, swappedBA.floors);
  if (!sameChange(doorsChangeA, swapDoorsA) || !sameChange(floorsChangeA, swapFloorsA)) {
    return {
      swappable: false,
      reason: "换序后另一推的门/地板开关结果变了，开门又关回的那一拍不能省略或错位。",
    };
  }
  const swapGoalsA = goalsDelta(level, swappedB, swappedBA);
  if (!sameGoals(goalsA, swapGoalsA)) {
    return { swappable: false, reason: "换序后另一推的目标格占空变化对不上，货位腾空的归属被打乱。" };
  }

  // 最终箱位及机关相同。
  if (!sameSnapshot(afterAB, swappedBA)) {
    return { swappable: false, reason: "两种次序推完后的最终箱位或门/地板状态不同，不是同一种搬运结果。" };
  }

  // 人能空走到的区域相同。
  const regionAB = reachability(level, afterAB, playerAB);
  const regionBA = reachability(
    level,
    swappedBA,
    { x: a.to.x - DIR_VEC[a.dir].x, y: a.to.y - DIR_VEC[a.dir].y },
  );
  if (!sameRegion(regionAB, regionBA)) {
    return { swappable: false, reason: "两推结束后箱子虽然相同，但人能空走到的区域不同，后续推法会被区别卡住。" };
  }
  return { swappable: true, reason: "两推互不依赖：换序后都合法，机关与目标变化各自不变，终局箱位和可达区域一致。" };
}

interface GadgetChange {
  id: string;
  value: boolean;
}

function gadgetsChanged(before: Record<string, boolean>, after: Record<string, boolean>): GadgetChange[] {
  const out: GadgetChange[] = [];
  for (const id of Object.keys(before).sort()) {
    if (before[id] !== after[id]) out.push({ id, value: after[id] });
  }
  return out;
}

function sameChange(a: GadgetChange[], b: GadgetChange[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => b[index]?.id === item.id && b[index]?.value === item.value);
}

interface GoalDelta {
  cell: string;
  occupied: boolean;
}

function goalsDelta(level: RuntimeLevel, before: Snapshot, after: Snapshot): GoalDelta[] {
  const goals = goalCells(level);
  const occupied = (snapshot: Snapshot, cell: Vec): boolean =>
    snapshot.boxes.some((box) => box.x === cell.x && box.y === cell.y);
  const out: GoalDelta[] = [];
  for (const cell of goals) {
    const was = occupied(before, cell);
    const now = occupied(after, cell);
    if (was !== now) out.push({ cell: cellKey(cell.x, cell.y), occupied: now });
  }
  return out;
}

function sameGoals(a: GoalDelta[], b: GoalDelta[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => b[index]?.cell === item.cell && b[index]?.occupied === item.occupied);
}

/** 推在序列里的稳定排序键：同材质箱按初始货位、再按起点、方向、落点排，保证规范化结果唯一。 */
function traceOrderKey(trace: PushTrace): string {
  return [
    trace.kind,
    trace.boxId,
    cellKey(trace.from.x, trace.from.y),
    trace.dir,
    cellKey(trace.to.x, trace.to.y),
  ].join("|");
}

/**
 * 把推迹序列按“相邻可交换”关系规范化：
 * 不断交换相邻且可交换的两推（取字典序较小者在前），直到没有可交换对。
 * 一段十来推的纪录可能要连续交换数次，这里老老实实逐对冒泡，不靠单步落点猜测。
 */
export function canonicalize(level: RuntimeLevel, initial: Snapshot, trace: PushTrace[]): PushTrace[] {
  return canonicalizeWithLinks(level, initial, trace).canonical;
}

function fnv1a64(text: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * FNV_PRIME) & FNV_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

/** 工法指纹：关卡 + 规范化后的推迹（含每推的机关终态）+ 终局箱位与机关。 */
export function methodFingerprint(level: RuntimeLevel, initial: Snapshot, canonical: PushTrace[]): string {
  const parts: string[] = [`level:${level.id}`, `pushes:${canonical.length}`];
  for (const trace of canonical) {
    parts.push(
      [
        "push",
        trace.kind,
        trace.boxId,
        trace.dir,
        cellKey(trace.from.x, trace.from.y),
        cellKey(trace.to.x, trace.to.y),
        `doors:${Object.keys(trace.doorsAfter).sort().map((id) => `${id}=${trace.doorsAfter[id] ? 1 : 0}`).join(",")}`,
        `floors:${Object.keys(trace.floorsAfter).sort().map((id) => `${id}=${trace.floorsAfter[id] ? 1 : 0}`).join(",")}`,
      ].join(";"),
    );
  }
  const end = replay(level, initial, canonical);
  if (end) {
    parts.push(`endBoxes:${end.boxes.map((box) => `${box.id}:${cellKey(box.x, box.y)}`).sort().join(",")}`);
    parts.push(`endDoors:${Object.keys(end.doors).sort().map((id) => `${id}=${end.doors[id] ? 1 : 0}`).join(",")}`);
    parts.push(`endFloors:${Object.keys(end.floors).sort().map((id) => `${id}=${end.floors[id] ? 1 : 0}`).join(",")}`);
  }
  return fnv1a64(parts.join("|"));
}

/** 按推迹完整重放，返回终局；任何一推不合法则返回 null。 */
export function replay(level: RuntimeLevel, initial: Snapshot, trace: PushTrace[]): Snapshot | null {
  let snapshot = initial;
  let player = level.player;
  for (const item of trace) {
    const next = applyOne(level, snapshot, player, item);
    if (!next) return null;
    player = { x: item.to.x - DIR_VEC[item.dir].x, y: item.to.y - DIR_VEC[item.dir].y };
    snapshot = next;
  }
  return snapshot;
}

/** 供账页“点两次推”使用：给出下标 i、i+1 两推在其前置局面下的交换判定。 */
export function explainAdjacent(
  level: RuntimeLevel,
  initial: Snapshot,
  trace: PushTrace[],
  index: number,
): SwapVerdict {
  if (index < 0 || index >= trace.length - 1) {
    return { swappable: false, reason: "请选相邻的两次推。" };
  }
  const prefix = stateAfter(level, initial, trace, index);
  if (!prefix) return { swappable: false, reason: "推迹在这一步之前已经无法重放，记录可能已损坏。" };
  return explainPair(level, prefix, trace[index], trace[index + 1]);
}

/** 规范化过程中实际发生过的相邻交换，用于账页展示“连续交换数次”的链路。 */
export interface SwapLink {
  index: number;
  left: PushTrace;
  right: PushTrace;
}

export function canonicalizeWithLinks(
  level: RuntimeLevel,
  initial: Snapshot,
  trace: PushTrace[],
): { canonical: PushTrace[]; links: SwapLink[] } {
  const result = trace.map((item) => ({ ...item }));
  const links: SwapLink[] = [];
  let changed = true;
  let guard = 0;
  const maxPasses = result.length * result.length + 4;
  while (changed && guard < maxPasses) {
    changed = false;
    guard += 1;
    for (let i = 0; i < result.length - 1; i += 1) {
      const prefix = stateAfter(level, initial, result, i);
      if (!prefix) return { canonical: result, links };
      const verdict = explainPair(level, prefix, result[i], result[i + 1]);
      if (verdict.swappable && traceOrderKey(result[i + 1]) < traceOrderKey(result[i])) {
        links.push({ index: i, left: { ...result[i] }, right: { ...result[i + 1] } });
        const tmp = result[i];
        result[i] = result[i + 1];
        result[i + 1] = tmp;
        changed = true;
      }
    }
  }
  return { canonical: result, links };
}
