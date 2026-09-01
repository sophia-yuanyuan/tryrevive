import { encodeLocalSpeechWav } from "@/shared/audio/pcm-wav";

export interface LocalSpeechRecording {
  stop(): Promise<Uint8Array>;
  cancel(): Promise<void>;
}

export async function startLocalSpeechRecording(
  signal?: AbortSignal
): Promise<LocalSpeechRecording> {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
    throw new Error("当前设备无法录制本机语音，请改用文字或本地材料");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  if (signal?.aborted) {
    stream.getTracks().forEach((track) => track.stop());
    throw new DOMException("录音已取消", "AbortError");
  }

  const context = new AudioContext();
  try {
    if (context.state === "suspended") await context.resume();
    if (context.state !== "running") throw new Error("audio context unavailable");
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    await context.close().catch(() => undefined);
    throw new Error("麦克风已经允许，但本机录音引擎没有启动；请改用文字材料", {
      cause: error
    });
  }
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4_096, 1, 1);
  const mute = context.createGain();
  const chunks: Float32Array[] = [];
  let closed = false;

  mute.gain.value = 0;
  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);

  async function cleanup(): Promise<void> {
    if (closed) return;
    closed = true;
    processor.onaudioprocess = null;
    source.disconnect();
    processor.disconnect();
    mute.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    await context.close().catch(() => undefined);
  }

  return {
    async stop() {
      try {
        return encodeLocalSpeechWav(chunks, context.sampleRate);
      } finally {
        await cleanup();
      }
    },
    cancel: cleanup
  };
}
