import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runtimeRoot = path.join(projectRoot, "resources/vendor/whisper/windows-x64");
const executable = path.join(runtimeRoot, "whisper-cli.exe");
const model = path.join(runtimeRoot, "ggml-base-q5_1.bin");
const manifestPath = path.join(runtimeRoot, "manifest.json");
const expectedModelSha256 = "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898";

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function toneWav() {
  const sampleRate = 16_000;
  const samples = sampleRate / 2;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVE", 8, "ascii");
  bytes.write("fmt ", 12, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) {
    bytes.writeInt16LE(
      Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 5_000),
      44 + index * 2
    );
  }
  return bytes;
}

test("Windows offline speech runtime loads its pinned model and processes a WAV", async (context) => {
  if (process.platform !== "win32") return context.skip("Windows-only integration");

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.runtimeVersion, "1.9.1");
  assert.equal(manifest.modelSha256, expectedModelSha256);
  assert.equal(await sha256(model), expectedModelSha256);

  const directory = await mkdtemp(path.join(os.tmpdir(), "tryrevive-speech-integration-"));
  const audioPath = path.join(directory, "tone.wav");
  const outputBase = path.join(directory, "result");
  const outputPath = `${outputBase}.txt`;
  try {
    await writeFile(audioPath, toneWav(), { flag: "wx" });
    await execFileAsync(
      executable,
      [
        "-m",
        model,
        "-f",
        audioPath,
        "-l",
        "zh",
        "-otxt",
        "-of",
        outputBase,
        "-nt",
        "-np",
        "-ng",
        "-t",
        "2"
      ],
      { encoding: "utf8", timeout: 60_000, windowsHide: true }
    );
    assert.equal(typeof (await readFile(outputPath, "utf8")), "string");
  } finally {
    await unlink(outputPath).catch(() => undefined);
    await unlink(audioPath).catch(() => undefined);
    await rmdir(directory).catch(() => undefined);
  }
});
