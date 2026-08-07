<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import type { GestureRecognizer, GestureRecognizerResult } from "@mediapipe/tasks-vision";
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import modelAssetPath from "@/renderer/assets/gesture_recognizer.task?url";
import {
  createGestureInteractionState,
  gestureHoldProgress,
  interpretGesture,
  type SupportedGesture
} from "@/shared/gesture/interaction";

const emit = defineEmits<{
  rotate: [degrees: number];
  selectNext: [];
  openSelected: [];
}>();

const video = ref<HTMLVideoElement | null>(null);
const phase = ref<"off" | "requesting" | "loading" | "active" | "error">("off");
const message = ref("摄像头默认关闭");
const gestureLabel = ref("还没有识别到手势");
const confidence = ref(0);
const holdProgress = ref(0);
const waitingForRelease = ref(false);
let stream: MediaStream | null = null;
let recognizer: GestureRecognizer | null = null;
let animationFrame = 0;
let lastInferenceAt = 0;
let lastVideoTime = -1;
let interaction = createGestureInteractionState();

const labels: Record<SupportedGesture, string> = {
  Open_Palm: "张开手掌 · 左右移动可转动星球",
  Closed_Fist: "握拳 · 保持片刻可选择下一张唱片",
  Thumb_Up: "竖起拇指 · 保持片刻可打开选中项目",
  None: "正在找手"
};

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "摄像头权限没有开启。你仍可使用鼠标、触摸和键盘。";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "没有找到可用摄像头。你仍可使用鼠标、触摸和键盘。";
  }
  return error instanceof Error ? error.message : "本机手势识别启动失败";
}

function handleResult(result: GestureRecognizerResult, timestamp: number): void {
  const category = result.gestures[0]?.[0];
  const rawName = category?.categoryName ?? "None";
  const name: SupportedGesture = ["Open_Palm", "Closed_Fist", "Thumb_Up"].includes(rawName)
    ? (rawName as SupportedGesture)
    : "None";
  const score = category?.score ?? 0;
  const palmX = result.landmarks[0]?.[9]?.x ?? null;
  gestureLabel.value = labels[name];
  confidence.value = score;
  const sample = { name, score, palmX, timestamp };
  const command = interpretGesture(interaction, sample);
  holdProgress.value = gestureHoldProgress(interaction, sample);
  waitingForRelease.value =
    ["Closed_Fist", "Thumb_Up"].includes(name) && score >= 0.65 && !interaction.discreteArmed;
  if (command?.type === "rotate") emit("rotate", command.degrees);
  if (command?.type === "select-next") emit("selectNext");
  if (command?.type === "open-selected") emit("openSelected");
}

function renderLoop(timestamp: number): void {
  if (phase.value !== "active" || !recognizer || !video.value) return;
  if (
    video.value.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.value.currentTime !== lastVideoTime &&
    timestamp - lastInferenceAt >= 100
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
    message.value = "当前环境不支持摄像头。你仍可使用鼠标、触摸和键盘。";
    return;
  }
  phase.value = "requesting";
  message.value = "等待你确认摄像头权限…";
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }
    });
    if (!video.value) throw new Error("摄像头预览尚未准备好");
    video.value.srcObject = stream;
    await video.value.play();
    phase.value = "loading";
    message.value = "正在载入本机手势模型…";
    const { GestureRecognizer } = await import("@mediapipe/tasks-vision");
    recognizer = await GestureRecognizer.createFromOptions(
      { wasmLoaderPath, wasmBinaryPath },
      {
        baseOptions: { modelAssetPath, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.55,
        cannedGesturesClassifierOptions: {
          scoreThreshold: 0.65,
          categoryAllowlist: ["Open_Palm", "Closed_Fist", "Thumb_Up"]
        }
      }
    );
    phase.value = "active";
    message.value = "本机识别中 · 画面不保存、不写入项目数据";
    animationFrame = requestAnimationFrame(renderLoop);
  } catch (error) {
    stop(false);
    phase.value = "error";
    message.value = errorMessage(error);
  }
}

function stop(updateMessage = true): void {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  recognizer?.close();
  recognizer = null;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  if (video.value) video.value.srcObject = null;
  lastInferenceAt = 0;
  lastVideoTime = -1;
  confidence.value = 0;
  holdProgress.value = 0;
  waitingForRelease.value = false;
  interaction = createGestureInteractionState();
  gestureLabel.value = "还没有识别到手势";
  if (updateMessage) {
    phase.value = "off";
    message.value = "摄像头已关闭";
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
  <section class="gesture-control" aria-labelledby="gesture-control-title">
    <div class="gesture-control-copy">
      <p class="summary-label">可选 · 本机摄像头手势</p>
      <h2 id="gesture-control-title">把手伸进星球，而不是把画面交给云端。</h2>
      <p>
        只有点击下方按钮后才会申请摄像头。画面逐帧进入本机 MediaPipe
        模型，不保存、不上传、不写入项目数据。MediaPipe SDK
        可能按其隐私说明发送不含画面的性能与使用指标。
      </p>
      <div class="gesture-guide" aria-label="支持的手势">
        <span>✋ 左右移动：转动</span>
        <span>✊ 保持：选下一张</span>
        <span>👍 保持：打开详情</span>
      </div>
      <div class="gesture-actions">
        <button
          v-if="!['requesting', 'loading', 'active'].includes(phase)"
          class="secondary-button"
          type="button"
          @click="start"
        >
          同意说明并开启摄像头手势
        </button>
        <button v-else class="secondary-button" type="button" @click="stop()">关闭摄像头</button>
        <a
          class="text-button"
          href="https://www.npmjs.com/package/@mediapipe/tasks-vision#privacy-notice"
          target="_blank"
          rel="noreferrer"
        >
          查看 MediaPipe 隐私说明
        </a>
      </div>
      <p class="gesture-status" :class="`gesture-status-${phase}`" aria-live="polite">
        {{ message }}
      </p>
    </div>

    <div class="gesture-preview" :class="{ 'gesture-preview-active': phase !== 'off' }">
      <video ref="video" muted playsinline aria-label="本机手势摄像头预览" />
      <div class="gesture-preview-overlay">
        <strong>{{ gestureLabel }}</strong>
        <small v-if="confidence">识别置信度 {{ Math.round(confidence * 100) }}%</small>
        <small v-else>摄像头画面会一直显示在这里</small>
        <div
          v-if="holdProgress > 0"
          class="gesture-hold-meter"
          role="progressbar"
          aria-label="手势保持进度"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="Math.round(holdProgress * 100)"
        >
          <span :style="{ width: `${Math.round(holdProgress * 100)}%` }" />
        </div>
        <small v-if="waitingForRelease">已触发 · 松开手势后才能再次使用</small>
        <small v-else-if="holdProgress > 0">保持进度 {{ Math.round(holdProgress * 100) }}%</small>
      </div>
    </div>
  </section>
</template>
