import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createFromOptions: vi.fn()
}));

vi.mock("@mediapipe/tasks-vision", () => ({
  GestureRecognizer: {
    createFromOptions: mocks.createFromOptions
  }
}));

import GestureControl from "@/renderer/components/GestureControl.vue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fakeStream() {
  const stop = vi.fn();
  return {
    stream: { getTracks: () => [{ stop }] } as unknown as MediaStream,
    stop
  };
}

describe("GestureControl lifecycle", () => {
  const originalMediaDevices = navigator.mediaDevices;

  beforeEach(() => {
    mocks.createFromOptions.mockReset();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: originalMediaDevices
    });
    vi.restoreAllMocks();
  });

  it("stops a camera stream that arrives after the user closes permission loading", async () => {
    const camera = deferred<MediaStream>();
    const { stream, stop } = fakeStream();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockReturnValue(camera.promise) }
    });
    const wrapper = mount(GestureControl);

    await wrapper.get("button").trigger("click");
    await wrapper.get("button").trigger("click");
    camera.resolve(stream);
    await flushPromises();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(mocks.createFromOptions).not.toHaveBeenCalled();
    expect(wrapper.get(".gesture-status").classes()).toContain("gesture-status-off");
    wrapper.unmount();
  });

  it("closes a recognizer that arrives after the user stops model loading", async () => {
    const recognizer = deferred<{ close: () => void }>();
    const close = vi.fn();
    const { stream, stop } = fakeStream();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) }
    });
    mocks.createFromOptions.mockReturnValue(recognizer.promise);
    const wrapper = mount(GestureControl);

    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(mocks.createFromOptions).toHaveBeenCalledTimes(1);
    await wrapper.get("button").trigger("click");
    recognizer.resolve({ close });
    await flushPromises();

    expect(stop).toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    expect(wrapper.get(".gesture-status").classes()).toContain("gesture-status-off");
    wrapper.unmount();
  });
});
