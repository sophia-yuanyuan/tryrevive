import { MAX_LOCAL_SPEECH_SECONDS } from "../speech/contracts";

const TARGET_SAMPLE_RATE = 16_000;

function clampSample(value: number): number {
  return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
}

function concatenate(chunks: readonly Float32Array[]): Float32Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function resample(input: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === TARGET_SAMPLE_RATE) return input;
  const outputLength = Math.max(1, Math.floor((input.length * TARGET_SAMPLE_RATE) / sourceRate));
  const output = new Float32Array(outputLength);
  const sourcePerOutput = sourceRate / TARGET_SAMPLE_RATE;

  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * sourcePerOutput);
    const end = Math.max(start + 1, Math.floor((index + 1) * sourcePerOutput));
    let sum = 0;
    let count = 0;
    for (let sourceIndex = start; sourceIndex < Math.min(end, input.length); sourceIndex += 1) {
      sum += input[sourceIndex] ?? 0;
      count += 1;
    }
    output[index] = count ? sum / count : (input[Math.min(start, input.length - 1)] ?? 0);
  }
  return output;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function encodeLocalSpeechWav(
  chunks: readonly Float32Array[],
  sourceSampleRate: number
): Uint8Array {
  if (
    !Number.isFinite(sourceSampleRate) ||
    sourceSampleRate < 8_000 ||
    sourceSampleRate > 192_000
  ) {
    throw new Error("录音采样率无效");
  }
  const maxSourceSamples = Math.floor(sourceSampleRate * MAX_LOCAL_SPEECH_SECONDS);
  const captured = concatenate(chunks).slice(0, maxSourceSamples);
  if (!captured.length) throw new Error("没有录到可转写的声音");
  const samples = resample(captured, sourceSampleRate);

  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  samples.forEach((sample, index) => {
    const normalized = clampSample(sample);
    const integer = normalized < 0 ? normalized * 0x8000 : normalized * 0x7fff;
    view.setInt16(44 + index * 2, Math.round(integer), true);
  });
  return bytes;
}

export const LOCAL_SPEECH_SAMPLE_RATE = TARGET_SAMPLE_RATE;
