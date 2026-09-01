<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import type { ProjectMood } from "@/shared/domain/model";
import type { VinylPlanetItem } from "@/shared/reward/vinyl-planet";
import { useRevivalStore } from "@/renderer/stores/revival";
import CompletionMoodPicker from "@/renderer/components/CompletionMoodPicker.vue";
import VinylArtifact from "@/renderer/components/VinylArtifact.vue";

const VinylPlanetScene = defineAsyncComponent(
  () => import("@/renderer/components/VinylPlanetScene.vue")
);

const store = useRevivalStore();
const { data, ready } = storeToRefs(store);
const selectedId = ref<string | null>(null);
const planetScene = ref<{ resetView: () => void } | null>(null);
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
const planetItems = computed<VinylPlanetItem[]>(() =>
  collection.value.map((project) => ({
    id: project.id,
    title: project.title,
    kind:
      project.status === "abandoned" ? "abandoned" : project.reward ? "completed" : "awaiting_mood",
    createdAt: project.reward?.createdAt ?? project.updatedAt
  }))
);

watch(
  collection,
  (projects) => {
    if (!projects.some((project) => project.id === selectedId.value)) {
      selectedId.value = projects[0]?.id ?? null;
    }
  },
  { immediate: true }
);

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
  <main id="main-content" class="collection-page">
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
          <button class="text-button" type="button" @click="planetScene?.resetView()">
            回到正面
          </button>
        </div>
        <Suspense>
          <VinylPlanetScene
            ref="planetScene"
            :items="planetItems"
            :selected-id="selectedProject?.id ?? null"
            @select="selectedId = $event"
          />
          <template #fallback>
            <div class="vinyl-planet-chunk-loading" role="status">正在准备本机 3D 星球…</div>
          </template>
        </Suspense>
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
              :aria-pressed="selectedProject?.id === project.id"
              :aria-label="`查看已完成项目：${project.title}`"
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
              :aria-pressed="selectedProject?.id === project.id"
              :aria-label="`查看已放下项目：${project.title}`"
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
