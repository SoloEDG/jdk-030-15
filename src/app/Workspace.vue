<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { StageView, TileLegend } from "@/features/atlas";
import { GadgetPanel } from "@/features/gadget";
import { MoverHud } from "@/features/hauler";
import { PushLedger, StepMeter } from "@/features/ledger";
import { LevelRail, RecordBoard } from "@/features/voyage";
import { dirFromKey, shouldCapture } from "./keys";
import { useWorkshop } from "./useWorkshop";

const shop = useWorkshop();
const { document, notice } = shop;
const { title, blurb } = shop.atlas;
const { counts } = shop.hauler;
const { summary } = shop.gadget;
const { steps, pushes, status, coverage } = shop.ledger;
const { catalog, completed } = shop.voyage;

function onKey(event: KeyboardEvent): void {
  if (!shouldCapture(event)) return;
  const action = dirFromKey(event);
  if (!action) return;
  event.preventDefault();
  if (action === "reset") shop.reset();
  else shop.move(action);
}

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="workshop">
    <header class="mast">
      <div class="brand">
        <span class="mark" aria-hidden="true">闩</span>
        <div>
          <h1>栈闩工房</h1>
          <p>箱认踏板，板动门廊。一步一格，记下你走的路。</p>
        </div>
      </div>
      <p class="notice" :data-tone="notice.tone">{{ notice.message }}</p>
    </header>
    <div class="bench">
      <aside class="rail">
        <LevelRail :catalog="catalog" @select="shop.selectLevel" @reset="shop.reset" />
        <RecordBoard :completed="completed" :records="document.records" />
      </aside>
      <main class="stage">
        <div class="stage-head">
          <h2>{{ title }}</h2>
          <p>{{ blurb }}</p>
        </div>
        <StageView :document="document" />
        <MoverHud :counts="counts" />
      </main>
      <aside class="side">
        <StepMeter :steps="steps" :pushes="pushes" :status="status" :coverage="coverage" />
        <PushLedger :document="document" :pushes="pushes" :steps="steps" />
        <GadgetPanel :document="document" :summary="summary" />
        <TileLegend />
      </aside>
    </div>
  </div>
</template>
