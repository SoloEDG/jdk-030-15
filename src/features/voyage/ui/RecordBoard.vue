<script setup lang="ts">
import { computed, ref } from "vue";
import { getLevel, hydrate } from "@/features/voyage";
import { explainAdjacent, initialSnapshot, type SwapVerdict } from "@/features/ledger/lib/trace";
import { methodRows } from "@/features/ledger/lib/method";
import { BOX_LABEL, type LevelRecord, type PushTrace } from "@/shared/types";

const props = defineProps<{
  completed: { id: string; title: string; bestSteps: number; methodCount: number; clearedAt: number }[];
  records: Record<string, LevelRecord>;
}>();

const ARROW: Record<PushTrace["dir"], string> = { n: "↑", e: "→", s: "↓", w: "←" };
const expanded = ref<string | null>(null);
const picked = ref<Record<string, number[]>>({});
const verdicts = ref<Record<string, SwapVerdict>>({});

const rows = computed(() =>
  props.completed.map((entry) => ({
    entry,
    methods: methodRows(props.records[entry.id]),
  })),
);

function when(stamp: number): string {
  return new Date(stamp).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toggleLevel(id: string): void {
  expanded.value = expanded.value === id ? null : id;
}

function chipLabel(item: PushTrace, index: number): string {
  return `第${index + 1}推 ${BOX_LABEL[item.kind]} ${ARROW[item.dir]} (${item.from.x},${item.from.y})→(${item.to.x},${item.to.y})`;
}

function togglePush(levelId: string, fingerprint: string, index: number): void {
  const key = rowKey(levelId, fingerprint);
  const current = picked.value[key] ? [...picked.value[key]] : [];
  const pos = current.indexOf(index);
  if (pos >= 0) {
    current.splice(pos, 1);
  } else {
    if (current.length >= 2) current.shift();
    current.push(index);
  }
  picked.value[key] = current;
  delete verdicts.value[key];
  if (current.length !== 2) return;
  const [a, b] = [...current].sort((x, y) => x - y);
  const row = methodRows(props.records[levelId]).find((item) => item.fingerprint === fingerprint);
  if (!row) return;
  if (b - a !== 1) {
    verdicts.value[key] = { swappable: false, reason: "只有相邻的两次推可以比较交换，请点序号挨着的两推。" };
    return;
  }
  const level = hydrate(getLevel(levelId));
  verdicts.value[key] = explainAdjacent(level, initialSnapshot(level), row.trace, a);
}

function rowKey(levelId: string, fingerprint: string): string {
  return `${levelId}:${fingerprint}`;
}

function methodName(index: number): string {
  return `工法 ${index + 1}`;
}
</script>

<template>
  <section class="panel records" aria-label="已完成关卡工法记录">
    <h2>工法账页</h2>
    <p v-if="completed.length === 0" class="lede">还没有通关记录。过关后按搬运工法分别记下最少实走步数。</p>
    <ol v-else class="level-records">
      <li v-for="({ entry, methods }) in rows" :key="entry.id" class="level-record">
        <button type="button" class="level-head" @click="toggleLevel(entry.id)">
          <b>{{ entry.title }}</b>
          <span class="summary">
            最少 {{ entry.bestSteps }} 步 ·
            {{ entry.methodCount > 0 ? `${entry.methodCount} 种工法` : "老成绩无推迹" }}
          </span>
          <small>{{ when(entry.clearedAt) }}</small>
          <span class="caret" aria-hidden="true">{{ expanded === entry.id ? "▾" : "▸" }}</span>
        </button>
        <ul v-if="expanded === entry.id" class="method-list">
          <li v-for="(row, mi) in methods" :key="rowKey(entry.id, row.fingerprint)" class="method-row" :class="{ legacy: row.legacy }">
            <template v-if="row.legacy">
              <p class="method-title">
                老纪录 · <b>{{ row.bestSteps }} 步</b>
              </p>
              <p class="hint">这条成绩只留下数值、没有推迹，无法判断属于哪种工法，不做归类猜测。</p>
            </template>
            <template v-else>
              <p class="method-title">
                {{ methodName(mi) }} · <b>{{ row.bestSteps }} 步</b> · {{ row.bestPushes }} 推
                <small>{{ when(row.clearedAt) }}</small>
              </p>
              <p class="hint">点两次相邻的推，查看它们为什么能或不能交换次序。</p>
              <ol class="push-list">
                <li v-for="(item, pi) in row.trace" :key="`${item.boxId}-${pi}`">
                  <button
                    type="button"
                    class="push-chip"
                    :class="{ picked: (picked[rowKey(entry.id, row.fingerprint)] ?? []).includes(pi) }"
                    @click="togglePush(entry.id, row.fingerprint, pi)"
                  >
                    {{ chipLabel(item, pi) }}
                  </button>
                </li>
              </ol>
              <div
                v-if="verdicts[rowKey(entry.id, row.fingerprint)]"
                class="verdict"
                :data-swap="verdicts[rowKey(entry.id, row.fingerprint)].swappable"
              >
                <b>{{ verdicts[rowKey(entry.id, row.fingerprint)].swappable ? "可以交换" : "不能交换" }}</b>
                <p>{{ verdicts[rowKey(entry.id, row.fingerprint)].reason }}</p>
              </div>
            </template>
          </li>
        </ul>
      </li>
    </ol>
  </section>
</template>
