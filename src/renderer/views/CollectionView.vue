<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from "vue";
import { storeToRefs } from "pinia";
import type { ProjectMood, RevivalProject } from "@/shared/domain/model";
import { createProjectComposition } from "@/shared/audio/vinyl-music";
import { useRevivalStore } from "@/renderer/stores/revival";
import CompletionMoodPicker from "@/renderer/components/CompletionMoodPicker.vue";
import VinylArtifact from "@/renderer/components/VinylArtifact.vue";

const store = useRevivalStore();
const { data, ready } = storeToRefs(store);
const selectedId = ref<string | null>(null);
const rotationX = ref(-9);
const rotationY = ref(0);
const savingMood = ref(false);
const error = ref("");

const completed = computed(() =>
  [...data.value.projects.filter((project) => project.status === "completed")].sort(
    (left, right) =>
      (right.reward?.createdAt ?? right.updatedAt) - (left.reward?.createdAt ?? left.updatedAt)
  )
);
const abandoned = computed(() =>
  [...data.value.projects.filter((project) => project.status === "abandoned")].sort(
    (left, right) => right.updatedAt - left.updatedAt
  )
);
const collection = computed(() => [...completed.value, ...abandoned.value]);
const selectedProject = computed(
  () =>
    collection.value.find((project) => project.id === selectedId.value) ??
    collection.value[0] ??
    null
);
const visibleCompleted = computed(() => completed.value.slice(0, 12));
const visibleAbandoned = computed(() => abandoned.value.slice(0, 8));
const sceneStyle = computed<CSSProperties>(() => ({
  "--scene-x": `${rotationX.value}deg`,
  "--scene-y": `${rotationY.value}deg`
}));

watch(
  collection,
  (projects) => {
    if (!projects.some((project) => project.id === selectedId.value)) {
      selectedId.value = projects[0]?.id ?? null;
    }
  },
  { immediate: true }
);

let drag: {
  pointerId: number;
  startX: number;
  startY: number;
  rotationX: number;
  rotationY: number;
} | null = null;

function beginDrag(event: PointerEvent): void {
  const target = event.target as Element;
  if (target.closest("button")) return;
  drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    rotationX: rotationX.value,
    rotationY: rotationY.value
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function moveDrag(event: PointerEvent): void {
  if (!drag || drag.pointerId !== event.pointerId) return;
  rotationY.value = drag.rotationY + (event.clientX - drag.startX) * 0.35;
  rotationX.value = Math.max(
    -28,
    Math.min(18, drag.rotationX - (event.clientY - drag.startY) * 0.18)
  );
}

function endDrag(event: PointerEvent): void {
  if (drag?.pointerId === event.pointerId) drag = null;
}

function rotate(horizontal: number, vertical = 0): void {
  rotationY.value += horizontal;
  rotationX.value = Math.max(-28, Math.min(18, rotationX.value + vertical));
}

function orbitStyle(project: RevivalProject, index: number, total: number): CSSProperties {
  const seed = createProjectComposition(project).seed;
  return {
    "--orbit-angle": `${(360 / Math.max(1, total)) * index}deg`,
    "--record-hue": `${seed % 360}`,
    "--orbit-depth": `${10 + (seed % 5)}rem`
  };
}

function memoryStyle(project: RevivalProject, index: number, total: number): CSSProperties {
  const seed = createProjectComposition(project).seed;
  const angle = (Math.PI * 2 * index) / Math.max(1, total);
  return {
    "--memory-left": `${76 + Math.cos(angle) * 13}%`,
    "--memory-top": `${68 + Math.sin(angle) * 18}%`,
    "--record-hue": `${seed % 360}`,
    "--memory-rotate": `${-18 + (seed % 37)}deg`
  };
}

async function saveMood(mood: ProjectMood): Promise<void> {
  if (!selectedProject.value) return;
  savingMood.value = true;
  error.value = "";
  try {
    await store.setRewardMood(selectedProject.value.id, mood);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "心情保存失败";
  } finally {
    savingMood.value = false;
  }
}
</script>

<template>
  <main class="collection-page">
    <header class="collection-hero">
      <div>
        <p class="eyebrow">你的项目收藏空间</p>
        <h1>黑胶星球</h1>
        <p>
          完成的项目围绕星球留下唱片；主动放下的项目进入黑洞历史。两边都保留记录，不会删除，也不评价你。
        </p>
      </div>
      <div class="collection-counts" aria-label="收藏数量">
        <span>
          <strong>{{ completed.length }}</strong>
          张完成唱片
        </span>
        <span>
          <strong>{{ abandoned.length }}</strong>
          份放下记录
        </span>
      </div>
    </header>

    <section v-if="!ready" class="collection-empty" aria-live="polite">正在读取本地收藏…</section>
    <section v-else-if="!collection.length" class="collection-empty">
      <p class="summary-label">星球还在等待第一张唱片</p>
      <h2>先完成或明确放下一个真实项目。</h2>
      <p>这里不会用任务数量催促你。收藏只记录你已经作出的决定。</p>
      <RouterLink class="primary-button" to="/">回到项目工作台</RouterLink>
    </section>

    <template v-else>
      <section class="collection-stage-card" aria-labelledby="planet-instructions">
        <div class="collection-stage-head">
          <p id="planet-instructions">拖动、触摸滑动，或用方向键转动星球。点击唱片查看详情。</p>
          <button
            class="text-button"
            type="button"
            @click="
              rotationX = -9;
              rotationY = 0;
            "
          >
            回到正面
          </button>
        </div>
        <div
          class="collection-stage"
          role="group"
          aria-label="可旋转的黑胶星球收藏"
          tabindex="0"
          @pointerdown="beginDrag"
          @pointermove="moveDrag"
          @pointerup="endDrag"
          @pointercancel="endDrag"
          @keydown.left.prevent="rotate(-14)"
          @keydown.right.prevent="rotate(14)"
          @keydown.up.prevent="rotate(0, -6)"
          @keydown.down.prevent="rotate(0, 6)"
        >
          <div class="collection-scene" :style="sceneStyle">
            <div class="vinyl-planet-core" aria-hidden="true">
              <span>TR</span>
            </div>
            <div class="planet-orbit-ring planet-orbit-ring-one" aria-hidden="true" />
            <div class="planet-orbit-ring planet-orbit-ring-two" aria-hidden="true" />
            <button
              v-for="(project, index) in visibleCompleted"
              :key="project.id"
              class="planet-record-node"
              :class="{ 'planet-record-selected': selectedProject?.id === project.id }"
              :style="orbitStyle(project, index, visibleCompleted.length)"
              type="button"
              :aria-label="`查看已完成项目：${project.title}`"
              @click.stop="selectedId = project.id"
            >
              <span>{{ project.title }}</span>
            </button>

            <button
              v-if="abandoned.length"
              class="black-hole-core"
              type="button"
              :aria-label="`查看黑洞中的 ${abandoned.length} 个已放下项目`"
              @click.stop="selectedId = abandoned[0]?.id ?? null"
            >
              <span>黑洞历史</span>
            </button>
            <button
              v-for="(project, index) in visibleAbandoned"
              :key="project.id"
              class="black-hole-memory"
              :class="{ 'black-hole-memory-selected': selectedProject?.id === project.id }"
              :style="memoryStyle(project, index, visibleAbandoned.length)"
              type="button"
              :aria-label="`查看已放下项目：${project.title}`"
              @click.stop="selectedId = project.id"
            >
              <span>{{ project.title }}</span>
            </button>
          </div>
        </div>
      </section>

      <section class="collection-library" aria-label="全部项目收藏">
        <div>
          <p class="summary-label">完成唱片</p>
          <div v-if="completed.length" class="collection-list">
            <button
              v-for="project in completed"
              :key="project.id"
              class="collection-list-item"
              :class="{ 'collection-list-item-active': selectedProject?.id === project.id }"
              type="button"
              @click="selectedId = project.id"
            >
              <strong>{{ project.title }}</strong>
              <small>{{ project.reward ? "可播放与导出" : "待选择完成心情" }}</small>
            </button>
          </div>
          <p v-else class="collection-list-empty">还没有完成唱片。</p>
        </div>
        <div>
          <p class="summary-label">黑洞历史</p>
          <div v-if="abandoned.length" class="collection-list">
            <button
              v-for="project in abandoned"
              :key="project.id"
              class="collection-list-item"
              :class="{ 'collection-list-item-active': selectedProject?.id === project.id }"
              type="button"
              @click="selectedId = project.id"
            >
              <strong>{{ project.title }}</strong>
              <small>记录仍保留在本机</small>
            </button>
          </div>
          <p v-else class="collection-list-empty">还没有放下的项目。</p>
        </div>
      </section>

      <section v-if="selectedProject" class="collection-detail" aria-live="polite">
        <header>
          <p class="summary-label">
            {{ selectedProject.status === "completed" ? "选中的完成唱片" : "选中的黑洞历史" }}
          </p>
          <h2>{{ selectedProject.title }}</h2>
        </header>
        <CompletionMoodPicker
          v-if="selectedProject.status === 'completed' && !selectedProject.reward"
          :busy="savingMood"
          @select="saveMood"
        />
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <VinylArtifact :key="selectedProject.id" :project="selectedProject" />
      </section>
    </template>
  </main>
</template>
