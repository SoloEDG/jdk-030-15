import type { GameDocument, RuntimeLevel, Vec } from "./types";

export function cloneDocument(document: GameDocument): GameDocument {
  return structuredClone(document);
}

export function cloneLevel(level: RuntimeLevel): RuntimeLevel {
  return structuredClone(level);
}

export function sameCell(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y;
}

export function addVec(origin: Vec, delta: Vec): Vec {
  return { x: origin.x + delta.x, y: origin.y + delta.y };
}
