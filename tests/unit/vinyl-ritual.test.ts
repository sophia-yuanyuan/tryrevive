import { describe, expect, it } from "vitest";
import {
  advanceVinylRitual,
  createVinylRitualState,
  vinylRitualCopy,
  vinylRitualProgress
} from "@/shared/reward/vinyl-ritual";

describe("vinyl reward ritual", () => {
  it("walks through the complete ritual without skipping a phase", () => {
    let state = createVinylRitualState();
    expect(state.phase).toBe("sealed");

    state = advanceVinylRitual(state, { type: "open_sleeve" });
    expect(state.phase).toBe("sleeve_open");
    state = advanceVinylRitual(state, { type: "grab_record" });
    expect(state.phase).toBe("record_held");
    state = advanceVinylRitual(state, { type: "place_record" });
    expect(state.phase).toBe("on_platter");
    state = advanceVinylRitual(state, { type: "lower_needle" });
    expect(state.phase).toBe("needle_down");
    state = advanceVinylRitual(state, { type: "play_started" });
    expect(state.phase).toBe("playing");
    state = advanceVinylRitual(state, { type: "play_ended" });
    expect(state.phase).toBe("ready_to_archive");
    state = advanceVinylRitual(state, { type: "archive" });
    expect(state.phase).toBe("archived");
    expect(vinylRitualProgress(state.phase)).toBe(1);

    state = advanceVinylRitual(state, { type: "restart" });
    expect(state.phase).toBe("sealed");
  });

  it("returns a held record to the open sleeve when it is released outside the platter", () => {
    let state = createVinylRitualState();
    state = advanceVinylRitual(state, { type: "open_sleeve" });
    state = advanceVinylRitual(state, { type: "grab_record" });
    state = advanceVinylRitual(state, { type: "drop_outside" });

    expect(state.phase).toBe("sleeve_open");
    expect(vinylRitualCopy(state.phase).primaryLabel).toContain("取出唱片");
  });

  it("ignores out-of-order events and only archives after playback ends or stops", () => {
    const sealed = createVinylRitualState();
    expect(advanceVinylRitual(sealed, { type: "play_started" })).toBe(sealed);

    const playing = { phase: "playing" as const };
    expect(advanceVinylRitual(playing, { type: "archive" })).toBe(playing);
    expect(advanceVinylRitual(playing, { type: "stop_playback" }).phase).toBe("ready_to_archive");
  });
});
