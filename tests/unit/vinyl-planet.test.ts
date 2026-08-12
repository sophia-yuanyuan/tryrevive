import { describe, expect, it } from "vitest";
import {
  VINYL_PLANET_MAX_PITCH,
  VINYL_PLANET_MIN_PITCH,
  clampVinylPlanetPitch,
  isVinylPlanetClick,
  layoutVinylPlanetItems,
  placementsForKind,
  resolveVinylPlanetInstance,
  resolveVisibleVinylPlanetHit,
  type VinylPlanetItem
} from "@/shared/reward/vinyl-planet";

function item(id: string, kind: VinylPlanetItem["kind"] = "completed"): VinylPlanetItem {
  return { id, title: `项目 ${id}`, kind, createdAt: 1_800_000_000_000 + id.length };
}

describe("vinyl planet layout", () => {
  it("keeps every project placement stable when unrelated projects are added", () => {
    const initial = layoutVinylPlanetItems([item("alpha"), item("beta", "abandoned")]);
    const expanded = layoutVinylPlanetItems([
      item("unrelated", "awaiting_mood"),
      item("alpha"),
      item("beta", "abandoned")
    ]);

    expect(expanded.find((placement) => placement.id === "alpha")).toEqual(initial[0]);
    expect(expanded.find((placement) => placement.id === "beta")).toEqual(initial[1]);
  });

  it("places all three meanings on finite, distinct orbit bands", () => {
    const placements = layoutVinylPlanetItems([
      item("complete"),
      item("waiting", "awaiting_mood"),
      item("history", "abandoned")
    ]);

    for (const placement of placements) {
      expect([placement.x, placement.y, placement.z, placement.radius].every(Number.isFinite)).toBe(
        true
      );
      expect(placementsForKind(placements, placement.kind)).toContainEqual(placement);
    }
    expect(placements.find((placement) => placement.kind === "abandoned")?.radius).toBeLessThan(
      3.5
    );
    expect(
      placements.find((placement) => placement.kind === "awaiting_mood")?.radius
    ).toBeGreaterThan(4);
    expect(placements.find((placement) => placement.kind === "completed")?.radius).toBeGreaterThan(
      5
    );
  });

  it("keeps up to one hundred unique ids without silently duplicating entries", () => {
    const items = Array.from({ length: 100 }, (_, index) => item(`project-${index}`));
    items.push(item("project-3"));
    const placements = layoutVinylPlanetItems(items);
    expect(placements).toHaveLength(100);
    expect(new Set(placements.map(({ id }) => id)).size).toBe(100);
  });

  it("resolves only valid instance indexes", () => {
    const ids = ["one", "two"];
    expect(resolveVinylPlanetInstance(ids, 1)).toBe("two");
    expect(resolveVinylPlanetInstance(ids, -1)).toBeNull();
    expect(resolveVinylPlanetInstance(ids, 3)).toBeNull();
    expect(resolveVinylPlanetInstance(ids, undefined)).toBeNull();
  });

  it("does not select a record hidden behind the opaque black-hole core", () => {
    const ids = ["visible-record", "hidden-record"];
    expect(resolveVisibleVinylPlanetHit(ids, 0, 4.2, null)).toBe("visible-record");
    expect(resolveVisibleVinylPlanetHit(ids, 1, 8.4, 5.1)).toBeNull();
    expect(resolveVisibleVinylPlanetHit(ids, 1, 4.2, 5.1)).toBe("hidden-record");
  });

  it("distinguishes a click from a drag and constrains the camera pitch", () => {
    expect(isVinylPlanetClick({ x: 10, y: 10 }, { x: 14, y: 13 })).toBe(true);
    expect(isVinylPlanetClick({ x: 10, y: 10 }, { x: 20, y: 10 })).toBe(false);
    expect(clampVinylPlanetPitch(-10)).toBe(VINYL_PLANET_MIN_PITCH);
    expect(clampVinylPlanetPitch(10)).toBe(VINYL_PLANET_MAX_PITCH);
    expect(clampVinylPlanetPitch(Number.NaN)).toBe(0);
  });
});
