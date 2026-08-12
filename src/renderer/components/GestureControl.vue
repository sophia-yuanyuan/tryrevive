<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import type { GestureRecognizer, GestureRecognizerResult } from "@mediapipe/tasks-vision";
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import modelAssetPath from "@/renderer/assets/gesture_recognizer.task?url";
import { extractRitualHandFeatures } from "@/shared/gesture/landmark-features";
import {
  createGestureInteractionState,
  gestureHoldProgress,
  interpretGesture,
  type RitualGestureIntent,
  type RitualGestureSample
} from "@/shared/gesture/interaction";

const emit = defineEmits<{
  intent: [intent: RitualGestureIntent];
}>();

const video = ref<HTMLVideoElement | null>(null);
const phase = ref<"off" | "requesting" | "loading" | "active" | "error">("off");
const message = ref("摄像头默认关闭");
const gestureLabel = ref("张开手掌打开封套，捏合手指抓取物体");
const metricLabel = ref("");
const holdProgress = ref(0);
const waitingForRelease = ref(false);
let stream: MediaStream | null = null;
let recognizer: GestureRecognizer | null = null;
let animationFrame = 0;
let lastInferenceAt = 0;
let lastVideoTime = -1;
let interaction = createGestureInteractionState();
let lifecycleGeneration = 0;

function isCurrentLifecycle(generation: number): boolean {
  return lifecycleGeneration === generation;
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "摄像头权限没有开启。鼠标、触摸和键盘仍可完成全部仪式。";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "没有找到可用摄像头。鼠标、触摸和键盘仍可完成全部仪式。";
  }
  return error instanceof Error ? error.message : "本机手势识别启动失败";
}

function handleResult(result: GestureRecognizerResult, timestamp: number): void {
  const preview = video.value;
  const features = extractRitualHandFeatures(
    result.landmarks[0],
    result.worldLandmarks[0],
    preview?.videoWidth || 640,
    preview?.videoHeight || 480
  );
  const sample: RitualGestureSample = {
    features: features.valid ? features : null,
    timestamp
  };
  for (const intent of interpretGesture(interaction, sample)) emit("intent", intent);
  holdProgress.value = gestureHoldProgress(interaction, sample);
  waitingForRelease.value = interaction.activePinch;

  if (!features.valid) {
    gestureLabel.value = "把一只完整的手放进画面";
    metricLabel.value = "距离镜头太远、手被裁切或暂时丢失时不会推进步骤";
  } else if (interaction.activePinch) {
    gestureLabel.value = "已经捏住 · 移动手指来拖动物体";
    metricLabel.value = `捏合比例 ${features.pinchRatio.toFixed(2)} · 张开手指后才会释放`;
  } else if (features.openPalm) {
    gestureLabel.value = "检测到张开的手掌";
    metricLabel.value = "稳定保持后只触发一次";
  } else {
    gestureLabel.value = "对准唱片或唱针，再捏合拇指和食指";
    metricLabel.value = `捏合比例 ${features.pinchRatio.toFixed(2)}`;
  }
}

function renderLoop(timestamp: number): void {
  if (phase.value !== "active" || !recognizer || !video.value) return;
  if (
    video.value.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.value.currentTime !== lastVideoTime &&
    timestamp - lastInferenceAt >= 50
  ) {
    lastInferenceAt = timestamp;
    lastVideoTime = video.value.currentTime;
    try {
      handleResult(recognizer.recognizeForVideo(video.value, timestamp), timestamp);
    } catch (error) {
      message.value = errorMessage(error);
    }
  }
  animationFrame = requestAnimationFrame(renderLoop);
}

async function start(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    phase.value = "error";
    message.value = "当前环境不支持摄像头。鼠标、触摸和键盘仍可完成全部仪式。";
    return;
  }
  const generation = ++lifecycleGeneration;
  let acquiredStream: MediaStream | null = null;
  let acquiredRecognizer: GestureRecognizer | null = null;
  phase.value = "requesting";
  message.value = "等待你确认摄像头权限…";
  try {
    acquiredStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }
    });
    if (!isCurrentLifecycle(generation)) {
      acquiredStream.getTracks().forEach((track) => track.stop());
      return;
    }
    if (!video.value) throw new Error("摄像头预览尚未准备好");
    stream = acquiredStream;
    video.value.srcObject = stream;
    await video.value.play();
    if (!isCurrentLifecycle(generation)) {
      acquiredStream.getTracks().forEach((track) => track.stop());
      return;
    }
    phase.value = "loading";
    message.value = "正在载入随应用打包的本机手势模型…";
    const { GestureRecognizer } = await import("@mediapipe/tasks-vision");
    if (!isCurrentLifecycle(generation)) return;
    acquiredRecognizer = await GestureRecognizer.createFromOptions(
      { wasmLoaderPath, wasmBinaryPath },
      {
        baseOptions: { modelAssetPath, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.55,
        cannedGesturesClassifierOptions: { scoreThreshold: 0.65 }
      }
    );
    if (!isCurrentLifecycle(generation)) {
      acquiredRecognizer.close();
      return;
    }
    recognizer = acquiredRecognizer;
    phase.value = "active";
    message.value = "本机识别 · 不保存 · 不上传";
    animationFrame = requestAnimationFrame(renderLoop);
  } catch (error) {
    if (!isCurrentLifecycle(generation)) {
      acquiredRecognizer?.close();
      acquiredStream?.getTracks().forEach((track) => track.stop());
      return;
    }
    stop(false);
    phase.value = "error";
    message.value = errorMessage(error);
  }
}

function stop(updateMessage = true): void {
  lifecycleGeneration += 1;
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  recognizer?.close();
  recognizer = null;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  if (video.value) video.value.srcObject = null;
  lastInferenceAt = 0;
  lastVideoTime = -1;
  holdProgress.value = 0;
  waitingForRelease.value = false;
  interaction = createGestureInteractionState();
  gestureLabel.value = "张开手掌打开封套，捏合手指抓取物体";
  metricLabel.value = "";
  if (updateMessage) {
    phase.value = "off";
    message.value = "摄像头已关闭";
    emit("intent", { type: "cancel" });
  }
}

function handleVisibility(): void {
  if (document.hidden && ["requesting", "loading", "active"].includes(phase.value)) stop();
}

document.addEventListener("visibilitychange", handleVisibility);
onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", handleVisibility);
  stop(false);
});
</script>

<template>
  <section
    class="gesture-control gesture-control-pip"
    aria-label="可选的本机摄像头手势"
    @pointerdown.stop
    @pointermove.stop
    @pointerup.stop
    @click.stop
  >
    <p class="sr-only">
      只有主动开启后才申请摄像头。画面逐帧进入随应用打包的本机 MediaPipe
      模型，不保存、不上传、不写入项目数据。
    </p>
    <div class="gesture-preview" :class="{ 'gesture-preview-active': phase !== 'off' }">
      <video ref="video" muted playsinline aria-label="本机手势摄像头预览" />
      <div class="gesture-preview-badge">本机识别 · 不保存</div>
      <div class="gesture-preview-overlay">
        <strong>{{ gestureLabel }}</strong>
        <small>{{ metricLabel || "手势画面会一直显示在这里" }}</small>
        <div
          v-if="holdProgress > 0"
          class="gesture-hold-meter"
          role="progressbar"
          aria-label="手势稳定进度"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="Math.round(holdProgress * 100)"
        >
          <span :style="{ width: `${Math.round(holdProgress * 100)}%` }" />
        </div>
        <small v-if="waitingForRelease">保持捏合可移动；张开手指才会释放</small>
      </div>
    </div>
    <div class="gesture-pip-actions">
      <button
        v-if="!['requesting', 'loading', 'active'].includes(phase)"
        class="gesture-pip-button"
        type="button"
        aria-label="同意说明并开启摄像头手势"
        @click="start"
      >
        开启本机手势
      </button>
      <button v-else class="gesture-pip-button" type="button" @click="stop()">关闭摄像头</button>
      <a
        href="https://www.npmjs.com/package/@mediapipe/tasks-vision#privacy-notice"
        target="_blank"
        rel="noreferrer"
      >
        隐私说明
      </a>
    </div>
    <p class="gesture-status" :class="`gesture-status-${phase}`" aria-live="polite">
      {{ message }}
    </p>
  </section>
</template>
