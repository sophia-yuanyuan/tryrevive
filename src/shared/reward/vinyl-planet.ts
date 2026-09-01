export type VinylPlanetItemKind = "completed" | "awaiting_mood" | "abandoned";

export interface VinylPlanetItem {
  id: string;
  title: string;
  kind: VinylPlanetItemKind;
  createdAt: number;
}

export interface VinylPlanetPlacement extends VinylPlanetItem {
  seed: number;
  hue: number;
  radius: number;
  angle: number;
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
}

export interface VinylPlanetPointerStart {
  x: number;
  y: number;
}

export const VINYL_PLANET_DRAG_THRESHOLD_PX = 6;
export const VINYL_PLANET_MIN_PITCH = -0.48;
export const VINYL_PLANET_MAX_PITCH = 0.36;

export function projectIdentitySeed(projectId: string, createdAt: number): number {
  const input = `${projectId}:${Math.max(0, Math.round(createdAt))}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unitFromSeed(seed: number, salt: number): number {
  let value = (seed + Math.imul(salt, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4_294_967_296;
}

function orbitForKind(kind: VinylPlanetItemKind, seed: number): { radius: number; height: number } {
  if (kind === "abandoned") {
    return { radius: 2.45 + unitFromSeed(seed, 5) * 0.95, height: 0.82 };
  }
  if (kind === "awaiting_mood") {
    return { radius: 4.2 + unitFromSeed(seed, 7) * 1.1, height: 1.35 };
  }
  return { radius: 5.15 + unitFromSeed(seed, 11) * 1.45, height: 1.75 };
}

export function createVinylPlanetPlacement(item: VinylPlanetItem): VinylPlanetPlacement {
  const seed = projectIdentitySeed(item.id, item.createdAt);
  const orbit = orbitForKind(item.kind, seed);
  const angle = unitFromSeed(seed, 13) * Math.PI * 2;
  const depthScale = item.kind === "abandoned" ? 0.5 : 0.62;
  const y = (unitFromSeed(seed, 17) * 2 - 1) * orbit.height;
  return {
    ...item,
    seed,
    hue: Math.round(unitFromSeed(seed, 19) * 359),
    radius: orbit.radius,
    angle,
    x: Math.cos(angle) * orbit.radius,
    y,
    z: Math.sin(angle) * orbit.radius * depthScale,
    rotation: (unitFromSeed(seed, 23) * 2 - 1) * 0.48,
    scale: item.kind === "abandoned" ? 0.78 : 0.88 + unitFromSeed(seed, 29) * 0.24
  };
}

export function layoutVinylPlanetItems(items: readonly VinylPlanetItem[]): VinylPlanetPlacement[] {
  const seen = new Set<string>();
  const placements: VinylPlanetPlacement[] = [];
  for (const item of items) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    placements.push(createVinylPlanetPlacement(item));
  }
  return placements;
}

export function placementsForKind(
  placements: readonly VinylPlanetPlacement[],
  kind: VinylPlanetItemKind
): VinylPlanetPlacement[] {
  return placements.filter((placement) => placement.kind === kind);
}

export function resolveVinylPlanetInstance(
  ids: readonly string[],
  instanceId: number | undefined
): string | null {
  if (!Number.isInteger(instanceId) || instanceId === undefined || instanceId < 0) return null;
  return ids[instanceId] ?? null;
}

export function resolveVisibleVinylPlanetHit(
  ids: readonly string[],
  instanceId: number | undefined,
  recordDistance: number,
  opaqueCoreDistance: number | null
): string | null {
  if (!Number.isFinite(recordDistance) || recordDistance < 0) return null;
  if (
    opaqueCoreDistance !== null &&
    Number.isFinite(opaqueCoreDistance) &&
    opaqueCoreDistance >= 0 &&
    opaqueCoreDistance <= recordDistance
  ) {
    return null;
  }
  return resolveVinylPlanetInstance(ids, instanceId);
}

export function clampVinylPlanetPitch(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(VINYL_PLANET_MIN_PITCH, Math.min(VINYL_PLANET_MAX_PITCH, value));
}

export function isVinylPlanetClick(
  start: VinylPlanetPointerStart,
  end: VinylPlanetPointerStart,
  threshold = VINYL_PLANET_DRAG_THRESHOLD_PX
): boolean {
  if (![start.x, start.y, end.x, end.y, threshold].every(Number.isFinite)) return false;
  return Math.hypot(end.x - start.x, end.y - start.y) <= Math.max(0, threshold);
}
