<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as THREE from "three";
import {
  clampVinylPlanetPitch,
  isVinylPlanetClick,
  layoutVinylPlanetItems,
  placementsForKind,
  resolveVisibleVinylPlanetHit,
  type VinylPlanetItem,
  type VinylPlanetItemKind,
  type VinylPlanetPlacement
} from "@/shared/reward/vinyl-planet";

const props = defineProps<{
  items: VinylPlanetItem[];
  selectedId: string | null;
}>();

const emit = defineEmits<{
  select: [projectId: string];
}>();

const mountElement = ref<HTMLElement | null>(null);
const rendererMode = ref<"loading" | "webgl" | "fallback">("loading");
const fallbackReason = ref("");
const reducedMotion = ref(false);
const hoveredId = ref<string | null>(null);
const placements = computed(() => layoutVinylPlanetItems(props.items));

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let worldGroup: THREE.Group | null = null;
let recordOrbitGroup: THREE.Group | null = null;
let selectionHalo: THREE.Mesh | null = null;
let accretionGroup: THREE.Group | null = null;
let blackHoleCore: THREE.Mesh | null = null;
let starField: THREE.Points | null = null;
let resizeObserver: ResizeObserver | null = null;
let motionPreference: MediaQueryList | null = null;
let animationFrame = 0;
let previousFrameAt = 0;
let visible = !document.hidden;
let yaw = 0;
let pitch = -0.08;
let pointerGesture: {
  pointerId: number;
  startX: number;
  startY: number;
  startYaw: number;
  startPitch: number;
  dragging: boolean;
} | null = null;

const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const recordMeshes: THREE.InstancedMesh[] = [];

function renderOnce(): void {
  if (!renderer || !scene || !camera) return;
  renderer.render(scene, camera);
}

function requestLoop(): void {
  if (animationFrame || rendererMode.value !== "webgl" || !visible) return;
  if (reducedMotion.value) {
    renderOnce();
    return;
  }
  previousFrameAt = performance.now();
  animationFrame = requestAnimationFrame(renderLoop);
}

function renderLoop(timestamp: number): void {
  animationFrame = 0;
  if (!renderer || !scene || !camera || !visible) return;
  const delta = Math.min(0.05, Math.max(0, (timestamp - previousFrameAt) / 1000));
  previousFrameAt = timestamp;
  if (!pointerGesture?.dragging) {
    if (recordOrbitGroup && !hoveredId.value) recordOrbitGroup.rotation.y += delta * 0.035;
    if (accretionGroup) accretionGroup.rotation.z += delta * 0.08;
    if (starField) starField.rotation.y += delta * 0.006;
  }
  renderOnce();
  animationFrame = requestAnimationFrame(renderLoop);
}

function stopLoop(): void {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = 0;
}

function resize(): void {
  if (!renderer || !camera || !mountElement.value) return;
  const width = Math.max(1, mountElement.value.clientWidth);
  const height = Math.max(1, mountElement.value.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderOnce();
}

function disposeObject(root: THREE.Object3D | null): void {
  if (!root) return;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    const renderable = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    if (renderable.geometry) geometries.add(renderable.geometry);
    const candidates = Array.isArray(renderable.material)
      ? renderable.material
      : [renderable.material];
    for (const material of candidates) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

function clearRecordMeshes(): void {
  hoveredId.value = null;
  if (!recordOrbitGroup) return;
  worldGroup?.remove(recordOrbitGroup);
  disposeObject(recordOrbitGroup);
  recordOrbitGroup.clear();
  recordOrbitGroup = null;
  selectionHalo = null;
  recordMeshes.splice(0);
}

function disposeScene(): void {
  stopLoop();
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (renderer) renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
  if (mountElement.value && pointerGesture) {
    const { pointerId } = pointerGesture;
    if (mountElement.value.hasPointerCapture(pointerId)) {
      mountElement.value.releasePointerCapture(pointerId);
    }
  }
  pointerGesture = null;
  disposeObject(scene);
  renderer?.renderLists.dispose();
  renderer?.dispose();
  renderer?.domElement.remove();
  renderer = null;
  scene = null;
  camera = null;
  worldGroup = null;
  recordOrbitGroup = null;
  selectionHalo = null;
  accretionGroup = null;
  blackHoleCore = null;
  starField = null;
  recordMeshes.splice(0);
}

function useFallback(message: string): void {
  hoveredId.value = null;
  disposeScene();
  rendererMode.value = "fallback";
  fallbackReason.value = message;
}

function handleContextLost(event: Event): void {
  event.preventDefault();
  useFallback("显卡绘制刚刚中断，已保留当前选择并切换到列表操作。你的收藏没有丢失。");
}

function createGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(128, 128, 10, 128, 128, 126);
    gradient.addColorStop(0, "rgba(255,235,199,0.86)");
    gradient.addColorStop(0.2, "rgba(235,150,91,0.38)");
    gradient.addColorStop(0.58, "rgba(105,126,209,0.13)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSpace(target: THREE.Group): void {
  const starCount = 900;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  let seed = 0x5eeda11;
  const random = (): number => {
    seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4_294_967_296;
  };
  for (let index = 0; index < starCount; index += 1) {
    const radius = 9 + random() * 15;
    const angle = random() * Math.PI * 2;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = (random() - 0.48) * 16;
    positions[index * 3 + 2] = Math.sin(angle) * radius - 4;
    const warmth = random();
    colors[index * 3] = 0.55 + warmth * 0.35;
    colors[index * 3 + 1] = 0.66 + warmth * 0.22;
    colors[index * 3 + 2] = 0.86 + warmth * 0.14;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  starField = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.045,
      transparent: true,
      opacity: 0.8,
      depthWrite: false
    })
  );
  target.add(starField);
}

function createAccretionDisk(target: THREE.Group): void {
  accretionGroup = new THREE.Group();
  accretionGroup.name = "tryrevive-original-accretion-disk";

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createGlowTexture(),
      transparent: true,
      opacity: 0.66,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  glow.scale.set(7.2, 7.2, 1);
  glow.position.z = -0.7;
  accretionGroup.add(glow);

  for (const [radius, tube, color, opacity, tilt] of [
    [1.62, 0.16, 0xffb56f, 0.72, 1.12],
    [2.05, 0.1, 0xf07f52, 0.42, 1.06],
    [2.46, 0.065, 0x769cff, 0.3, 1.18],
    [2.9, 0.035, 0xffd9a4, 0.17, 1.02]
  ] as const) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 12, 180),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    ring.rotation.x = tilt;
    ring.rotation.z = radius * 0.12;
    accretionGroup.add(ring);
  }

  const dustCount = 760;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustColors = new Float32Array(dustCount * 3);
  let seed = 0x71c0ffee;
  const random = (): number => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed / 4_294_967_296;
  };
  for (let index = 0; index < dustCount; index += 1) {
    const radius = 1.45 + Math.pow(random(), 0.7) * 1.8;
    const angle = random() * Math.PI * 2;
    dustPositions[index * 3] = Math.cos(angle) * radius;
    dustPositions[index * 3 + 1] = (random() - 0.5) * 0.18;
    dustPositions[index * 3 + 2] = Math.sin(angle) * radius;
    const hot = 1 - (radius - 1.45) / 1.8;
    dustColors[index * 3] = 0.55 + hot * 0.45;
    dustColors[index * 3 + 1] = 0.45 + hot * 0.35;
    dustColors[index * 3 + 2] = 0.72 + (1 - hot) * 0.28;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute("color", new THREE.BufferAttribute(dustColors, 3));
  const dust = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.035,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  dust.rotation.x = 1.1;
  accretionGroup.add(dust);

  blackHoleCore = new THREE.Mesh(
    new THREE.SphereGeometry(1.23, 72, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  blackHoleCore.renderOrder = 4;
  accretionGroup.add(blackHoleCore);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(1.27, 0.018, 8, 160),
    new THREE.MeshBasicMaterial({
      color: 0xffe2bd,
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  rim.rotation.x = 0.08;
  accretionGroup.add(rim);
  target.add(accretionGroup);
}

function createOrbitGuides(target: THREE.Group): void {
  for (const [radius, color, opacity, scaleZ] of [
    [2.95, 0x8b94b8, 0.09, 0.5],
    [4.75, 0xd38c63, 0.1, 0.58],
    [6.2, 0x8da5da, 0.1, 0.62]
  ] as const) {
    const points = Array.from({ length: 129 }, (_, index) => {
      const angle = (index / 128) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius * scaleZ);
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity })
    );
    target.add(line);
  }
}

function createRecordGeometry(kind: VinylPlanetItemKind): THREE.BufferGeometry {
  const radius = kind === "abandoned" ? 0.34 : 0.4;
  const geometry = new THREE.CylinderGeometry(radius, radius, 0.05, 40, 2);
  geometry.rotateX(Math.PI / 2);
  if (kind === "abandoned") {
    const positions = geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const normalized = Math.min(1, Math.abs(x) / radius);
      positions.setZ(index, positions.getZ(index) + normalized * normalized * 0.2);
      positions.setY(index, positions.getY(index) * 0.78);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  return geometry;
}

function createInstancedRecords(
  values: VinylPlanetPlacement[],
  kind: VinylPlanetItemKind
): THREE.InstancedMesh | null {
  if (!values.length) return null;
  const material = new THREE.MeshPhysicalMaterial({
    color: kind === "awaiting_mood" ? 0x6d7280 : kind === "abandoned" ? 0x494652 : 0x242833,
    emissive: kind === "abandoned" ? 0x110d16 : 0x0d111a,
    emissiveIntensity: kind === "abandoned" ? 0.5 : 0.36,
    roughness: kind === "abandoned" ? 0.75 : 0.32,
    metalness: kind === "abandoned" ? 0.18 : 0.74,
    clearcoat: kind === "abandoned" ? 0.08 : 0.88,
    clearcoatRoughness: 0.24
  });
  const mesh = new THREE.InstancedMesh(createRecordGeometry(kind), material, values.length);
  const dummy = new THREE.Object3D();
  const ids: string[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const placement = values[index]!;
    dummy.position.set(placement.x, placement.y, placement.z);
    dummy.rotation.set(0, 0, placement.rotation);
    dummy.scale.setScalar(placement.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    ids.push(placement.id);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData.projectIds = ids;
  mesh.userData.kind = kind;
  return mesh;
}

function createInstancedLabels(
  values: VinylPlanetPlacement[],
  kind: VinylPlanetItemKind
): THREE.InstancedMesh | null {
  if (!values.length) return null;
  const radius = kind === "abandoned" ? 0.13 : 0.19;
  const mesh = new THREE.InstancedMesh(
    new THREE.CircleGeometry(radius, 32),
    new THREE.MeshBasicMaterial({
      color: kind === "abandoned" ? 0x77728c : kind === "awaiting_mood" ? 0xb5bac5 : 0xe9a16e,
      toneMapped: false,
      side: THREE.DoubleSide
    }),
    values.length
  );
  const dummy = new THREE.Object3D();
  for (let index = 0; index < values.length; index += 1) {
    const placement = values[index]!;
    dummy.position.set(placement.x, placement.y, placement.z + 0.082);
    dummy.rotation.set(0, 0, placement.rotation);
    dummy.scale.setScalar(placement.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function syncSelectionHalo(): void {
  if (!selectionHalo) return;
  const selected = placements.value.find(({ id }) => id === props.selectedId);
  selectionHalo.visible = Boolean(selected);
  if (!selected) {
    renderOnce();
    return;
  }
  selectionHalo.position.set(selected.x, selected.y, selected.z + 0.02);
  selectionHalo.rotation.z = selected.rotation;
  selectionHalo.scale.setScalar(selected.scale * (selected.kind === "abandoned" ? 0.9 : 1.05));
  renderOnce();
}

function rebuildRecords(): void {
  if (!worldGroup) return;
  clearRecordMeshes();
  recordOrbitGroup = new THREE.Group();
  recordOrbitGroup.name = "project-record-orbits";
  for (const kind of ["completed", "awaiting_mood", "abandoned"] as const) {
    const mesh = createInstancedRecords(placementsForKind(placements.value, kind), kind);
    if (!mesh) continue;
    recordMeshes.push(mesh);
    recordOrbitGroup.add(mesh);
    const labels = createInstancedLabels(placementsForKind(placements.value, kind), kind);
    if (labels) recordOrbitGroup.add(labels);
  }
  selectionHalo = new THREE.Mesh(
    new THREE.RingGeometry(0.48, 0.55, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffd7aa,
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  selectionHalo.visible = false;
  recordOrbitGroup.add(selectionHalo);
  worldGroup.add(recordOrbitGroup);
  syncSelectionHalo();
  requestLoop();
}

function applyViewRotation(): void {
  if (!worldGroup) return;
  worldGroup.rotation.set(pitch, yaw, 0);
  renderOnce();
}

function resetView(): void {
  yaw = 0;
  pitch = -0.08;
  if (recordOrbitGroup) recordOrbitGroup.rotation.y = 0;
  applyViewRotation();
}

function rotate(horizontal: number, vertical = 0): void {
  yaw += horizontal;
  pitch = clampVinylPlanetPitch(pitch + vertical);
  applyViewRotation();
}

defineExpose({ resetView, rotate });

function setRaycaster(clientX: number, clientY: number): void {
  if (!camera || !mountElement.value) return;
  const bounds = mountElement.value.getBoundingClientRect();
  pointer.x = ((clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1;
  pointer.y = -((clientY - bounds.top) / Math.max(1, bounds.height)) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function projectAt(clientX: number, clientY: number): string | null {
  if (!camera || !recordMeshes.length) return null;
  setRaycaster(clientX, clientY);
  const hit = raycaster.intersectObjects(recordMeshes, false)[0];
  if (!hit) return null;
  const coreHit = blackHoleCore ? raycaster.intersectObject(blackHoleCore, false)[0] : null;
  const ids = (hit.object.userData.projectIds ?? []) as string[];
  return resolveVisibleVinylPlanetHit(ids, hit.instanceId, hit.distance, coreHit?.distance ?? null);
}

function handlePointerDown(event: PointerEvent): void {
  if (rendererMode.value !== "webgl" || !event.isPrimary || event.button !== 0) return;
  mountElement.value?.focus({ preventScroll: true });
  pointerGesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startYaw: yaw,
    startPitch: pitch,
    dragging: false
  };
  mountElement.value?.setPointerCapture(event.pointerId);
}

function handlePointerMove(event: PointerEvent): void {
  const active = pointerGesture;
  if (!active || active.pointerId !== event.pointerId) {
    hoveredId.value = projectAt(event.clientX, event.clientY);
    return;
  }
  if (
    !active.dragging &&
    !isVinylPlanetClick(
      { x: active.startX, y: active.startY },
      { x: event.clientX, y: event.clientY }
    )
  ) {
    active.dragging = true;
  }
  if (!active.dragging) return;
  hoveredId.value = null;
  yaw = active.startYaw + (event.clientX - active.startX) * 0.006;
  pitch = clampVinylPlanetPitch(active.startPitch - (event.clientY - active.startY) * 0.004);
  applyViewRotation();
}

function finishPointer(event: PointerEvent, canceled = false): void {
  const active = pointerGesture;
  if (!active || active.pointerId !== event.pointerId) return;
  const clicked =
    !canceled &&
    !active.dragging &&
    isVinylPlanetClick(
      { x: active.startX, y: active.startY },
      { x: event.clientX, y: event.clientY }
    );
  if (mountElement.value?.hasPointerCapture(event.pointerId)) {
    mountElement.value.releasePointerCapture(event.pointerId);
  }
  pointerGesture = null;
  if (clicked) {
    const projectId = projectAt(event.clientX, event.clientY);
    if (projectId) emit("select", projectId);
  }
  requestLoop();
}

function handleKeydown(event: KeyboardEvent): void {
  const movement: Record<string, [number, number]> = {
    ArrowLeft: [-0.16, 0],
    ArrowRight: [0.16, 0],
    ArrowUp: [0, -0.08],
    ArrowDown: [0, 0.08]
  };
  const delta = movement[event.key];
  if (!delta) return;
  event.preventDefault();
  rotate(delta[0], delta[1]);
}

function handleVisibility(): void {
  visible = !document.hidden;
  if (visible) requestLoop();
  else stopLoop();
}

function updateMotionPreference(event?: MediaQueryListEvent): void {
  reducedMotion.value = event?.matches ?? motionPreference?.matches ?? false;
  if (reducedMotion.value) {
    stopLoop();
    renderOnce();
  } else {
    requestLoop();
  }
}

function initScene(): void {
  if (!mountElement.value) return;
  rendererMode.value = "loading";
  fallbackReason.value = "";
  try {
    disposeScene();
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.className = "vinyl-planet-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
    mountElement.value.append(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020307);
    scene.fog = new THREE.FogExp2(0x020307, 0.026);
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    camera.position.set(0, 2.5, 13.8);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0x9fb9ff, 0x180d08, 1.5));
    const warmLight = new THREE.PointLight(0xffaa70, 42, 16);
    warmLight.position.set(-2.6, 4.2, 4.8);
    scene.add(warmLight);
    const coolLight = new THREE.PointLight(0x6f91ff, 36, 18);
    coolLight.position.set(5.5, -1.3, 3.2);
    scene.add(coolLight);

    worldGroup = new THREE.Group();
    worldGroup.name = "vinyl-planet-world";
    scene.add(worldGroup);
    createSpace(worldGroup);
    createOrbitGuides(worldGroup);
    createAccretionDisk(worldGroup);
    applyViewRotation();
    rebuildRecords();

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mountElement.value);
    resize();
    rendererMode.value = "webgl";
    requestLoop();
  } catch {
    useFallback("这台设备暂时不能绘制 3D 星球，项目列表仍然可以完整选择和打开。");
  }
}

watch(
  () => props.items.map(({ id, kind, createdAt }) => `${id}:${kind}:${createdAt}`).join("|"),
  () => {
    if (rendererMode.value === "webgl") rebuildRecords();
  }
);
watch(() => props.selectedId, syncSelectionHalo);

onMounted(() => {
  motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  updateMotionPreference();
  motionPreference.addEventListener("change", updateMotionPreference);
  document.addEventListener("visibilitychange", handleVisibility);
  initScene();
});

onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", handleVisibility);
  motionPreference?.removeEventListener("change", updateMotionPreference);
  disposeScene();
});
</script>

<template>
  <section
    class="vinyl-planet-scene"
    :data-renderer="rendererMode"
    :data-reduced-motion="reducedMotion ? 'true' : 'false'"
  >
    <div
      ref="mountElement"
      class="vinyl-planet-viewport"
      role="group"
      aria-label="可旋转的真 3D 黑胶星球收藏"
      tabindex="0"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerleave="hoveredId = null"
      @pointerup="finishPointer($event)"
      @pointercancel="finishPointer($event, true)"
      @keydown="handleKeydown"
    />

    <div v-if="rendererMode === 'loading'" class="vinyl-planet-loading" role="status">
      正在点亮本机 3D 黑胶星球…
    </div>
    <div v-else-if="rendererMode === 'fallback'" class="vinyl-planet-fallback" role="status">
      <div class="vinyl-planet-fallback-visual" aria-hidden="true">
        <span class="vinyl-planet-fallback-ring vinyl-planet-fallback-ring-one" />
        <span class="vinyl-planet-fallback-ring vinyl-planet-fallback-ring-two" />
        <span class="vinyl-planet-fallback-core" />
      </div>
      <p>{{ fallbackReason }}</p>
      <button class="secondary-button" type="button" @click="initScene">重新尝试 3D</button>
    </div>

    <footer class="vinyl-planet-status" aria-live="polite">
      <span>
        {{
          rendererMode === "webgl"
            ? "本机 WebGL 真 3D · 原创程序化场景"
            : "兼容画面 · 用下方列表选择项目"
        }}
      </span>
      <span v-if="hoveredId">松开以打开这张项目唱片</span>
      <span v-else>{{ items.length }} 份项目记忆围绕同一颗星球</span>
    </footer>
  </section>
</template>
