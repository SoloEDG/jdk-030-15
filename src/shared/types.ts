export type Dir = "n" | "e" | "s" | "w";
export type TileKind = "wall" | "floor" | "goal" | "gap";
export type BoxKind = "timber" | "iron" | "glass";
export type FloorMorph = "bridge" | "seal";
export type AttemptStatus = "playing" | "cleared";

export interface Vec {
  x: number;
  y: number;
}

export interface Box {
  id: string;
  kind: BoxKind;
  x: number;
  y: number;
}

export interface Plate {
  id: string;
  x: number;
  y: number;
  accept: BoxKind;
  doorIds: string[];
  floorIds: string[];
  powered: boolean;
}

export interface Door {
  id: string;
  x: number;
  y: number;
  open: boolean;
}

export interface FloorPatch {
  id: string;
  x: number;
  y: number;
  morph: FloorMorph;
  active: boolean;
}

export interface RuntimeLevel {
  id: string;
  title: string;
  blurb: string;
  width: number;
  height: number;
  tiles: TileKind[][];
  player: Vec;
  boxes: Box[];
  plates: Plate[];
  doors: Door[];
  floors: FloorPatch[];
}

export interface Attempt {
  steps: number;
  /** 真正改变货位的推箱次数。 */
  pushes: number;
  status: AttemptStatus;
  /** 本次尝试中每次推箱的推迹，按发生顺序记录。 */
  trace: PushTrace[];
}

/** 一次真正改变货位的推箱：箱从 from 被推向 to，推前站在 from。 */
export interface PushTrace {
  boxId: string;
  kind: BoxKind;
  dir: Dir;
  from: Vec;
  to: Vec;
  playerBefore: Vec;
  playerAfter: Vec;
  /** 这一推落地、机关结算后的门状态，按门 id 记录。 */
  doorsAfter: Record<string, boolean>;
  /** 这一推落地、机关结算后的地板状态，按地板 id 记录。 */
  floorsAfter: Record<string, boolean>;
}

/** 同一工法下的一条成绩。 */
export interface MethodRecord {
  /** 工法指纹：对推迹序列做归一化（相邻可交换推取规范序）后的哈希。 */
  fingerprint: string;
  bestSteps: number;
  bestPushes: number;
  clearedAt: number;
  /** 生成该工法的推迹；老版本留下的无推迹成绩没有此字段。 */
  trace?: PushTrace[];
}

export interface LevelRecord {
  bestSteps: number;
  clearedAt: number;
  /** 按搬运工法分别记账；无推迹的老成绩不在此列。 */
  methods?: MethodRecord[];
}

export interface GameDocument {
  version: 1;
  currentLevelId: string;
  level: RuntimeLevel;
  attempt: Attempt;
  records: Record<string, LevelRecord>;
}

export interface MoveResult {
  moved: boolean;
  pushed: boolean;
  boxId?: string;
  reason?: "blocked" | "cleared" | "idle";
}

export const BOX_LABEL: Record<BoxKind, string> = {
  timber: "木箱",
  iron: "铁箱",
  glass: "玻璃箱",
};

export const DIR_VEC: Record<Dir, Vec> = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
};
