import { ref } from "vue";
import { useAtlas } from "@/features/atlas";
import { useGadget } from "@/features/gadget";
import { useHauler } from "@/features/hauler";
import { useLedger } from "@/features/ledger";
import { loadInitial, useVoyage } from "@/features/voyage";
import type { Notice } from "@/shared/commands";
import type { Dir } from "@/shared/types";

export function useWorkshop() {
  const document = ref(loadInitial());
  const notice = ref<Notice>({
    tone: "info",
    message: "把对得上的箱子压上踏板，门和地板会跟着变。",
  });
  const atlas = useAtlas(document);
  const hauler = useHauler(document);
  const gadget = useGadget(document);
  const ledger = useLedger(document);
  const voyage = useVoyage(document);

  function notify(next: Notice): void {
    notice.value = next;
  }

  function move(dir: Dir): void {
    const result = hauler.tryMove(dir);
    if (!result.moved) {
      if (result.reason === "cleared") {
        notify({ tone: "warn", message: "本关已通关。重置或另选关卡后再推。" });
      }
      return;
    }
    gadget.refresh();
    const tick = ledger.afterMove(dir, result);
    if (tick.cleared) {
      const commit = voyage.commitClear();
      const pushText = `${document.value.attempt.pushes} 推`;
      const swapText = commit.links.length > 0 ? `（规范化时连续交换 ${commit.links.length} 次相邻推后比对）` : "";
      const tail = commit.matched
        ? `归入已有工法${swapText}，${commit.improved ? "实走步数刷新该工法最优。" : "步数没有更省，工法最优保持不变。"}`
        : `识别出一种新工法（${pushText}），已单独入账。`;
      notify({
        tone: "success",
        message: `通关，实走 ${document.value.attempt.steps} 步、${pushText}。${tail}`,
      });
    }
  }

  function reset(): void {
    voyage.resetLevel();
    notify({ tone: "info", message: "已重置当前关卡，最佳记录仍在。" });
  }

  function selectLevel(id: string): void {
    voyage.openLevel(id);
    notify({
      tone: "info",
      message: `进入「${document.value.level.title}」。${document.value.level.blurb}`,
    });
  }

  return { document, notice, atlas, hauler, gadget, ledger, voyage, move, reset, selectLevel };
}
