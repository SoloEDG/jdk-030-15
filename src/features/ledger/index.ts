export { useLedger } from "./model/useLedger";
export { coverageLine, filledGoals, goalsSatisfied } from "./lib/win";
export { countMove, freshAttempt, markCleared, registerPush } from "./lib/steps";
export {
  canonicalize,
  canonicalizeWithLinks,
  explainAdjacent,
  explainPair,
  initialSnapshot,
  methodFingerprint,
  reachability,
  replay,
  type SwapLink,
  type SwapVerdict,
} from "./lib/trace";
export {
  commitMethodRecord,
  methodRows,
  traceIsReplayable,
  type MethodCommit,
  type MethodRow,
} from "./lib/method";
export { default as StepMeter } from "./ui/StepMeter.vue";
export { default as PushLedger } from "./ui/PushLedger.vue";
