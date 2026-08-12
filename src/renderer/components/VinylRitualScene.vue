<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as THREE from "three";
import {
  advanceVinylRitual,
  createVinylRitualState,
  vinylRitualCopy,
  vinylRitualProgress,
  type VinylRitualEvent,
  type VinylRitualPhase
} from "@/shared/reward/vinyl-ritual";

const props = defineProps<{
  projectTitle: string;
  coverHue: number;
  playing: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  requestPlay: [];
  requestStop: [];
}>();

const mountElement = ref<HTMLElement | null>(null);
const rendererMode = ref<"loading" | "webgl" | "fallback">("loading");
const fallbackReason = ref("");
const ritual = ref(createVinylRitualState());
const dragging = ref(false);
const reducedMotion = ref(false);

const phase = computed(() => ritual.value.phase);
const copy = computed(() => vinylRitualCopy(phase.value));
const progress = computed(() => Math.round(vinylRitualProgress(phase.value) * 100));

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let animationFrame = 0;
let resizeObserver: ResizeObserver | null = null;
let motionPreference: MediaQueryList | null = null;
let sleeveGroup: THREE.Group | null = null;
let sleeveFront: THREE.Mesh | null = null;
let recordGroup: THREE.Group | null = null;
let platter: THREE.Mesh | null = null;
let tonearm: THREE.Group | null = null;
let stars: THREE.Points | null = null;
let halo: THREE.Group | null = null;
let pointerId: number | null = null;
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const dragPoint = new THREE.Vector3();
const recordTarget = new THREE.Vector3(-2.3, 0.35, -0.02);
const recordRotationTarget = new THREE.Euler(Math.PI / 2, 0, 0);
const recordScaleTarget = new THREE.Vector3(1, 1, 1);

const phaseLabels: Array<{ phase: VinylRitualPhase; label: string }> = [
  { phase: "sealed", label: "打开" },
  { phase: "sleeve_open", label: "取出" },
  { phase: "record_held", label: "放盘" },
  { phase: "on_platter", label: "落针" },
  { phase: "playing", label: "聆听" },
  { phase: "ready_to_archive", label: "收藏" },
  { phase: "archived", label: "归档" }
];

function phaseIndex(value: VinylRitualPhase): number {
  if (value === "needle_down") return 3;
  return phaseLabels.findIndex((item) => item.phase === value);
}

function dispatch(event: VinylRitualEvent): void {
  const next = advanceVinylRitual(ritual.value, event);
  if (next === ritual.value) return;
  ritual.value = next;
  syncSceneTarget(next.phase);
}

function runPrimaryAction(): void {
  if (props.busy) return;
  switch (phase.value) {
    case "sealed":
      dispatch({ type: "open_sleeve" });
      break;
    case "sleeve_open":
      dispatch({ type: "grab_record" });
      break;
    case "record_held":
      dragging.value = false;
      dispatch({ type: "place_record" });
      break;
    case "on_platter":
      dispatch({ type: "lower_needle" });
      emit("requestPlay");
      break;
    case "needle_down":
      emit("requestPlay");
      break;
    case "playing":
      emit("requestStop");
      break;
    case "ready_to_archive":
      dispatch({ type: "archive" });
      break;
    case "archived":
      dispatch({ type: "restart" });
      break;
  }
}

function setPointer(event: PointerEvent): void {
  const element = mountElement.value;
  if (!element) return;
  const bounds = element.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 + 1;
  if (camera) raycaster.setFromCamera(pointer, camera);
}

function intersects(object: THREE.Object3D | null): boolean {
  return Boolean(object && raycaster.intersectObject(object, true).length);
}

function handlePointerDown(event: PointerEvent): void {
  if (!camera || rendererMode.value !== "webgl") return;
  mountElement.value?.focus({ preventScroll: true });
  setPointer(event);

  if (phase.value === "sealed" && intersects(sleeveGroup)) {
    dispatch({ type: "open_sleeve" });
    return;
  }
  if (phase.value === "sleeve_open" && intersects(recordGroup)) {
    dispatch({ type: "grab_record" });
    dragging.value = true;
    pointerId = event.pointerId;
    mountElement.value?.setPointerCapture(event.pointerId);
    return;
  }
  if (phase.value === "on_platter" && intersects(tonearm)) {
    dispatch({ type: "lower_needle" });
    emit("requestPlay");
  }
}

function handlePointerMove(event: PointerEvent): void {
  if (!dragging.value || pointerId !== event.pointerId || !recordGroup || !camera) return;
  setPointer(event);
  if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;
  recordGroup.position.set(
    THREE.MathUtils.clamp(dragPoint.x, -3.9, 3.8),
    THREE.MathUtils.clamp(dragPoint.y, -1.25, 2.5),
    0.5
  );
  recordGroup.rotation.x = Math.PI / 2;
}

function handlePointerEnd(event: PointerEvent): void {
  if (!dragging.value || pointerId !== event.pointerId) return;
  setPointer(event);
  const placed = intersects(platter);
  dragging.value = false;
  pointerId = null;
  if (mountElement.value?.hasPointerCapture(event.pointerId)) {
    mountElement.value.releasePointerCapture(event.pointerId);
  }
  dispatch({ type: placed ? "place_record" : "drop_outside" });
}

function handleKeydown(event: KeyboardEvent): void {
  if (["Enter", " "].includes(event.key)) {
    event.preventDefault();
    runPrimaryAction();
    return;
  }
  if (phase.value !== "record_held" || !recordGroup) return;
  const movement: Record<string, [number, number]> = {
    ArrowLeft: [-0.18, 0],
    ArrowRight: [0.18, 0],
    ArrowUp: [0, 0.18],
    ArrowDown: [0, -0.18]
  };
  const delta = movement[event.key];
  if (!delta) return;
  event.preventDefault();
  recordGroup.position.x = THREE.MathUtils.clamp(recordGroup.position.x + delta[0], -3.9, 3.8);
  recordGroup.position.y = THREE.MathUtils.clamp(recordGroup.position.y + delta[1], -1.25, 2.5);
  recordTarget.copy(recordGroup.position);
}

function syncSceneTarget(nextPhase: VinylRitualPhase): void {
  if (sleeveFront) {
    sleeveFront.userData.targetRotationY = nextPhase === "sealed" ? 0 : -0.34;
  }

  if (["sealed", "sleeve_open"].includes(nextPhase)) {
    recordTarget.set(
      nextPhase === "sealed" ? -2.32 : -1.4,
      0.35,
      nextPhase === "sealed" ? -0.02 : 0.58
    );
    recordRotationTarget.set(Math.PI / 2, 0, nextPhase === "sealed" ? 0 : -0.18);
    recordScaleTarget.setScalar(nextPhase === "sealed" ? 0.92 : 1);
  } else if (nextPhase === "record_held") {
    recordTarget.set(-0.15, 0.68, 0.82);
    recordRotationTarget.set(Math.PI / 2, 0, -0.1);
    recordScaleTarget.setScalar(1.04);
  } else if (["on_platter", "needle_down", "playing", "ready_to_archive"].includes(nextPhase)) {
    recordTarget.set(2.18, -0.56, 0);
    recordRotationTarget.set(0, 0, 0);
    recordScaleTarget.setScalar(1);
  } else if (nextPhase === "archived") {
    recordTarget.set(0, 0.95, -4.35);
    recordRotationTarget.set(Math.PI / 2, 0, 0);
    recordScaleTarget.setScalar(0.16);
  }

  if (tonearm) {
    tonearm.userData.targetRotationZ = ["needle_down", "playing"].includes(nextPhase)
      ? -0.72
      : -0.18;
  }
}

function createRecord(): THREE.Group {
  const group = new THREE.Group();
  group.name = "project-record";
  const vinyl = new THREE.Mesh(
    new THREE.CylinderGeometry(1.08, 1.08, 0.075, 96),
    new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.34, metalness: 0.72 })
  );
  vinyl.receiveShadow = true;
  vinyl.castShadow = true;
  group.add(vinyl);

  const grooveMaterial = new THREE.MeshBasicMaterial({
    color: 0x6b7180,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide
  });
  for (const radius of [0.38, 0.54, 0.7, 0.86, 1.01]) {
    const groove = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.008, 6, 72), grooveMaterial);
    groove.rotation.x = Math.PI / 2;
    groove.position.y = 0.044;
    group.add(groove);
  }

  const labelColor = new THREE.Color().setHSL((props.coverHue % 360) / 360, 0.55, 0.48);
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(0.29, 0.29, 0.083, 64),
    new THREE.MeshStandardMaterial({ color: labelColor, roughness: 0.58, metalness: 0.12 })
  );
  label.position.y = 0.003;
  group.add(label);
  return group;
}

function createSleeve(): THREE.Group {
  const group = new THREE.Group();
  group.name = "project-sleeve";
  const hue = (props.coverHue % 360) / 360;
  const baseColor = new THREE.Color().setHSL(hue, 0.42, 0.19);
  const accentColor = new THREE.Color().setHSL((hue + 0.2) % 1, 0.58, 0.46);
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(3.05, 3.05, 0.16),
    new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.72, metalness: 0.04 })
  );
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const coverTexture = createCoverTexture();
  sleeveFront = new THREE.Mesh(
    new THREE.BoxGeometry(3.08, 3.08, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: coverTexture,
      roughness: 0.52,
      metalness: 0.08,
      emissive: accentColor.clone().multiplyScalar(0.08)
    })
  );
  sleeveFront.position.z = 0.13;
  sleeveFront.position.x = -0.03;
  sleeveFront.castShadow = true;
  group.add(sleeveFront);

  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(2.72, 2.72, 0.1)),
    new THREE.LineBasicMaterial({ color: 0xf4d7b2, transparent: true, opacity: 0.34 })
  );
  frame.position.z = 0.19;
  sleeveFront.add(frame);
  return group;
}

function createCoverTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);

  const hue = props.coverHue % 360;
  const gradient = context.createLinearGradient(0, 0, 1024, 1024);
  gradient.addColorStop(0, `hsl(${hue} 54% 24%)`);
  gradient.addColorStop(0.52, `hsl(${(hue + 38) % 360} 48% 38%)`);
  gradient.addColorStop(1, `hsl(${(hue + 118) % 360} 38% 13%)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1024, 1024);

  const glow = context.createRadialGradient(710, 270, 12, 710, 270, 470);
  glow.addColorStop(0, "rgba(255,235,198,0.42)");
  glow.addColorStop(0.42, "rgba(220,157,104,0.12)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 1024, 1024);

  let seed = (props.projectTitle.length * 2166136261 + props.coverHue) >>> 0;
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      seed = Math.imul(seed ^ (seed >>> 13), 16777619) >>> 0;
      const alpha = 0.05 + (seed % 22) / 100;
      context.fillStyle = `rgba(255,255,255,${alpha})`;
      context.fillRect(column * 256 + 2, row * 256 + 2, 252, 252);
      context.strokeStyle = "rgba(255,255,255,0.1)";
      context.lineWidth = 2;
      context.strokeRect(column * 256 + 2, row * 256 + 2, 252, 252);
    }
  }

  context.fillStyle = "rgba(8,10,15,0.46)";
  context.fillRect(62, 680, 900, 264);
  context.fillStyle = "rgba(255,255,255,0.62)";
  context.font = "600 30px Arial, sans-serif";
  context.letterSpacing = "8px";
  context.fillText("TRYREVIVE · COMPLETED", 92, 746);
  context.fillStyle = "white";
  context.font = "600 64px Georgia, serif";
  const displayTitle =
    props.projectTitle.length > 13 ? `${props.projectTitle.slice(0, 13)}…` : props.projectTitle;
  context.fillText(displayTitle, 90, 840, 820);
  context.fillStyle = "rgba(255,255,255,0.5)";
  context.font = "28px Arial, sans-serif";
  context.fillText("A real project, carried to a real result.", 92, 894);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer?.capabilities.getMaxAnisotropy() ?? 1);
  return texture;
}

function createTurntable(targetScene: THREE.Scene): void {
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(3.55, 0.38, 3.25),
    new THREE.MeshStandardMaterial({ color: 0x2b303b, roughness: 0.34, metalness: 0.58 })
  );
  deck.position.set(2.18, -0.95, 0);
  deck.castShadow = true;
  deck.receiveShadow = true;
  targetScene.add(deck);

  platter = new THREE.Mesh(
    new THREE.CylinderGeometry(1.27, 1.31, 0.14, 96),
    new THREE.MeshStandardMaterial({ color: 0x535c6d, roughness: 0.28, metalness: 0.82 })
  );
  platter.position.set(2.18, -0.69, 0);
  platter.receiveShadow = true;
  targetScene.add(platter);

  tonearm = new THREE.Group();
  tonearm.name = "tonearm";
  tonearm.position.set(3.43, -0.54, -1.02);
  const pivot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.24, 0.25, 32),
    new THREE.MeshStandardMaterial({ color: 0xb8a281, roughness: 0.28, metalness: 0.9 })
  );
  tonearm.add(pivot);
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.1, 1.95),
    new THREE.MeshStandardMaterial({ color: 0xd8c6aa, roughness: 0.25, metalness: 0.88 })
  );
  arm.position.z = 0.88;
  arm.position.y = 0.1;
  tonearm.add(arm);
  targetScene.add(tonearm);
}

function createSpace(targetScene: THREE.Scene): void {
  const starCount = 520;
  const positions = new Float32Array(starCount * 3);
  let seed = (props.coverHue + props.projectTitle.length * 997) >>> 0;
  const random = (): number => {
    seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4_294_967_296;
  };
  for (let index = 0; index < starCount; index += 1) {
    positions[index * 3] = (random() - 0.5) * 22;
    positions[index * 3 + 1] = (random() - 0.35) * 13;
    positions[index * 3 + 2] = -2 - random() * 11;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({ color: 0xd9e4ff, size: 0.028, transparent: true, opacity: 0.72 })
  );
  targetScene.add(stars);

  halo = new THREE.Group();
  halo.position.set(0, 0.95, -4.8);
  for (const [radius, color, opacity, tilt] of [
    [1.7, 0xf0a36c, 0.28, 0.64],
    [2.15, 0x8aa7ff, 0.16, 0.82],
    [2.58, 0xffd29d, 0.1, 1.02]
  ] as const) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.055, 10, 128),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    ring.rotation.x = tilt;
    halo.add(ring);
  }
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.82, 64, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  halo.add(core);
  targetScene.add(halo);
}

function resize(): void {
  if (!renderer || !camera || !mountElement.value) return;
  const width = Math.max(1, mountElement.value.clientWidth);
  const height = Math.max(1, mountElement.value.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function renderLoop(): void {
  if (!renderer || !scene || !camera) return;
  const smoothing = reducedMotion.value ? 1 : 0.1;
  if (recordGroup && !dragging.value) {
    recordGroup.position.lerp(recordTarget, smoothing);
    recordGroup.rotation.x = THREE.MathUtils.lerp(
      recordGroup.rotation.x,
      recordRotationTarget.x,
      smoothing
    );
    recordGroup.rotation.z = THREE.MathUtils.lerp(
      recordGroup.rotation.z,
      recordRotationTarget.z,
      smoothing
    );
    recordGroup.scale.lerp(recordScaleTarget, smoothing);
    if (phase.value === "playing" && !reducedMotion.value) recordGroup.rotation.y += 0.018;
    else recordGroup.rotation.y = THREE.MathUtils.lerp(recordGroup.rotation.y, 0, smoothing);
  }
  if (sleeveFront) {
    sleeveFront.rotation.y = THREE.MathUtils.lerp(
      sleeveFront.rotation.y,
      Number(sleeveFront.userData.targetRotationY ?? 0),
      smoothing
    );
  }
  if (tonearm) {
    tonearm.rotation.z = THREE.MathUtils.lerp(
      tonearm.rotation.z,
      Number(tonearm.userData.targetRotationZ ?? -0.18),
      smoothing
    );
  }
  if (!reducedMotion.value) {
    if (stars) stars.rotation.y += 0.00018;
    if (halo) halo.rotation.z += 0.0007;
  }
  renderer.render(scene, camera);
  animationFrame = requestAnimationFrame(renderLoop);
}

function disposeScene(): void {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (renderer) renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
  scene?.traverse((object) => {
    const candidate = object as THREE.Mesh & { material?: THREE.Material | THREE.Material[] };
    candidate.geometry?.dispose();
    const materials = Array.isArray(candidate.material) ? candidate.material : [candidate.material];
    for (const material of materials) {
      if (!material) continue;
      const textured = material as THREE.Material & { map?: THREE.Texture | null };
      textured.map?.dispose();
      material.dispose();
    }
  });
  renderer?.dispose();
  renderer?.domElement.remove();
  renderer = null;
  scene = null;
  camera = null;
  sleeveGroup = null;
  sleeveFront = null;
  recordGroup = null;
  platter = null;
  tonearm = null;
  stars = null;
  halo = null;
}

function useFallback(message: string): void {
  disposeScene();
  rendererMode.value = "fallback";
  fallbackReason.value = message;
}

function handleContextLost(event: Event): void {
  event.preventDefault();
  if (props.playing) emit("requestStop");
  useFallback("显卡绘制刚刚中断，已切换到可操作的简化画面。你的项目和奖励没有丢失。");
}

function initScene(): void {
  if (!mountElement.value) return;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.domElement.className = "vinyl-ritual-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
    mountElement.value.prepend(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030407);
    scene.fog = new THREE.FogExp2(0x030407, 0.052);
    camera = new THREE.PerspectiveCamera(39, 1, 0.1, 40);
    camera.position.set(0, 3.65, 10.2);
    camera.lookAt(0, 0.15, 0);

    scene.add(new THREE.HemisphereLight(0xb9ceff, 0x23170e, 1.25));
    const keyLight = new THREE.DirectionalLight(0xffd7ad, 3.1);
    keyLight.position.set(-3.5, 6, 6);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x799cff, 22, 13);
    rimLight.position.set(3.4, 2.5, 2);
    scene.add(rimLight);
    const platterLight = new THREE.PointLight(0xf2b77e, 32, 7.5);
    platterLight.position.set(2.4, 2.3, 3.3);
    scene.add(platterLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 12),
      new THREE.MeshStandardMaterial({ color: 0x07090d, roughness: 0.5, metalness: 0.3 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.18;
    floor.receiveShadow = true;
    scene.add(floor);

    createSpace(scene);
    sleeveGroup = createSleeve();
    sleeveGroup.position.set(-2.35, 0.34, 0);
    sleeveGroup.rotation.y = 0.08;
    scene.add(sleeveGroup);
    createTurntable(scene);
    recordGroup = createRecord();
    scene.add(recordGroup);
    recordGroup.position.copy(recordTarget);
    recordGroup.rotation.copy(recordRotationTarget);
    recordGroup.scale.copy(recordScaleTarget);
    syncSceneTarget(phase.value);

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mountElement.value);
    resize();
    rendererMode.value = "webgl";
    renderLoop();
  } catch {
    useFallback("这台设备暂时不能绘制 3D 场景，已切换到可操作的简化画面。");
  }
}

function updateMotionPreference(event?: MediaQueryListEvent): void {
  reducedMotion.value = event?.matches ?? motionPreference?.matches ?? false;
}

watch(
  () => props.playing,
  (isPlaying, wasPlaying) => {
    if (isPlaying && phase.value === "needle_down") dispatch({ type: "play_started" });
    if (!isPlaying && wasPlaying && phase.value === "playing") dispatch({ type: "stop_playback" });
  }
);

onMounted(() => {
  motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  updateMotionPreference();
  motionPreference.addEventListener("change", updateMotionPreference);
  initScene();
});

onBeforeUnmount(() => {
  motionPreference?.removeEventListener("change", updateMotionPreference);
  disposeScene();
});
</script>

<template>
  <section class="vinyl-ritual" :data-phase="phase" :data-renderer="rendererMode">
    <header class="vinyl-ritual-header">
      <div>
        <p class="summary-label">{{ copy.step }} · 真 3D 黑胶仪式</p>
        <h2>{{ projectTitle }}</h2>
      </div>
      <p class="vinyl-ritual-renderer-status" role="status">
        {{ rendererMode === "webgl" ? "本机 WebGL · 内容不上传" : "兼容画面 · 完整操作可用" }}
      </p>
    </header>

    <ol class="vinyl-ritual-steps" aria-label="黑胶仪式进度">
      <li
        v-for="(item, index) in phaseLabels"
        :key="item.phase"
        :class="{
          'vinyl-ritual-step-current': phaseIndex(phase) === index,
          'vinyl-ritual-step-complete': phaseIndex(phase) > index
        }"
      >
        <span>{{ index + 1 }}</span>
        {{ item.label }}
      </li>
    </ol>

    <div
      ref="mountElement"
      class="vinyl-ritual-stage"
      role="group"
      tabindex="0"
      :aria-label="`${copy.title} ${copy.instruction}`"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerEnd"
      @pointercancel="handlePointerEnd"
      @keydown="handleKeydown"
    >
      <div v-if="rendererMode !== 'webgl'" class="vinyl-ritual-fallback" aria-hidden="true">
        <div class="vinyl-ritual-fallback-halo" />
        <div class="vinyl-ritual-fallback-sleeve" :class="`phase-${phase}`" />
        <div class="vinyl-ritual-fallback-record" :class="`phase-${phase}`" />
        <div class="vinyl-ritual-fallback-platter" />
      </div>
      <div class="vinyl-ritual-stage-shade" aria-hidden="true" />
      <div class="vinyl-ritual-instruction" aria-live="polite">
        <p>{{ copy.step }}</p>
        <strong>{{ copy.title }}</strong>
        <span>{{ copy.instruction }}</span>
      </div>
    </div>

    <p v-if="fallbackReason" class="vinyl-ritual-fallback-message" role="status">
      {{ fallbackReason }}
    </p>

    <footer class="vinyl-ritual-controls">
      <div
        class="vinyl-ritual-progress"
        role="progressbar"
        aria-label="黑胶仪式完成进度"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="progress"
      >
        <span :style="{ width: `${progress}%` }" />
      </div>
      <button class="primary-button" type="button" :disabled="busy" @click="runPrimaryAction">
        {{ busy ? "正在准备声音…" : copy.primaryLabel }}
      </button>
      <p>可用鼠标、触摸、`Enter` 或空格；取出唱片后，方向键可以移动它。</p>
    </footer>
  </section>
</template>
