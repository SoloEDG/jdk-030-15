<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { BOX_LABEL, type GameDocument, type PushTrace } from "@/shared/types";
import { explainAdjacent, initialSnapshot, type SwapVerdict } from "../lib/trace";

const props = defineProps<{ document: GameDocument; pushes: number; steps: number }>();

const selected = ref<number[]>([]);
const verdict = ref<SwapVerdict | null>(null);

const ARROW: Record<PushTrace["dir"], string> = { n: "↑", e: "→", s: "↓", w: "←" };

const trace = computed(() => props.document.attempt.trace);

watch(
  () => props.document.attempt.trace.length,
  () => {
    selected.value = [];
    verdict.value = null;
  },
);

function chipLabel(item: PushTrace, index: number): string {
  return `第${index + 1}推 ${BOX_LABEL[item.kind]} ${ARROW[item.dir]} (${item.from.x},${item.from.y})→(${item.to.x},${item.to.y})`;
}

function toggle(index: number): void {
  const pos = selected.value.indexOf(index);
  if (pos >= 0) {
    selected.value.splice(pos, 1);
  } else {
    if (selected.value.length >= 2) selected.value.shift();
    selected.value.push(index);
  }
  verdict.value = null;
  if (selected.value.length !== 2) return;
  const [a, b] = [...selected.value].sort((x, y) => x - y);
  if (b - a !== 1) {
    verdict.value = { swappable: false, reason: "只有相邻的两次推可以比较交换，请点序号挨着的两推。" };
    return;
  }
  verdict.value = explainAdjacent(
    props.document.level,
    initialSnapshot(props.document.level),
    trace.value,
    a,
  );
}
</script>

<template>
  <section class="panel push-ledger" aria-label="推次工账">
    <h2>推次工账</h2>
    <p class="lede">
      只记真正改变货位的推箱：本局 {{ pushes }} 推 / {{ steps }} 步。
      空走绕路不另算一种工法。
    </p>
    <p v-if="trace.length === 0" class="hint">还没有推箱。推一次就记一笔，可点相邻两推查看能否交换次序。</p>
    <ol v-else class="push-list">
      <li v-for="(item, index) in trace" :key="`${item.boxId}-${index}`">
        <button
          type="button"
          class="push-chip"
          :class="{ picked: selected.includes(index) }"
          @click="toggle(index)"
        >
          {{ chipLabel(item, index) }}
        </button>
      </li>
    </ol>
    <div v-if="verdict" class="verdict" :data-swap="verdict.swappable">
      <b>{{ verdict.swappable ? "可以交换" : "不能交换" }}</b>
      <p>{{ verdict.reason }}</p>
    </div>
    <p v-else-if="selected.length === 1" class="hint">已选第 {{ selected[0] + 1 }} 推，再点一推相邻的做比较。</p>
  </section>
</template>
