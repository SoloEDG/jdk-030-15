import { computed, type Ref } from "vue";
import { countMove, markCleared, registerPush } from "../lib/steps";
import { coverageLine, goalsSatisfied } from "../lib/win";
import type { Dir, GameDocument, MoveResult } from "@/shared/types";

export function useLedger(document: Ref<GameDocument>) {
  const steps = computed(() => document.value.attempt.steps);
  const pushes = computed(() => document.value.attempt.pushes);
  const trace = computed(() => document.value.attempt.trace);
  const status = computed(() => document.value.attempt.status);
  const coverage = computed(() => coverageLine(document.value));
  function afterMove(dir: Dir, result: MoveResult): { counted: boolean; cleared: boolean } {
    const counted = countMove(document.value, result);
    if (!counted) return { counted: false, cleared: false };
    registerPush(document.value, result, dir);
    if (goalsSatisfied(document.value)) return { counted: true, cleared: markCleared(document.value) };
    return { counted: true, cleared: false };
  }
  return {
    steps,
    pushes,
    trace,
    status,
    coverage,
    afterMove,
    goalsSatisfied: () => goalsSatisfied(document.value),
  };
}
