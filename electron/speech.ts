import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import {
  LocalSpeechCapabilitySchema,
  LocalSpeechResultSchema,
  parseLocalSpeechRequest,
  type LocalSpeechCapability,
  type LocalSpeechResult
} from "../src/shared/speech/contracts";
import { normalizeSpeechTranscript } from "../src/shared/speech/transcript";

const execFileAsync = promisify(execFile);
const RUNTIME_VERSION = "1.9.1";
const MODEL_SHA256 = "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898";

interface OfflineSpeechManifest {
  runtimeVersion?: unknown;
  modelSha256?: unknown;
  files?: unknown;
}

let runtimeVerification: Promise<{ executable: string; model: string } | null> | null = null;

function runtimeRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "whisper", "windows-x64")
    : path.resolve(__dirname, "../../resources/vendor/whisper/windows-x64");
}

function unavailable(message: string): LocalSpeechCapability {
  return LocalSpeechCapabilitySchema.parse({
    available: false,
    culture: null,
    recognizer: null,
    message
  });
}

export async function getLocalSpeechCapability(): Promise<LocalSpeechCapability> {
  if (process.platform !== "win32") {
    return unavailable("离线语音首版仅支持 Windows；仍可使用文字、PDF 或 DOCX。");
  }
  if (!(await getVerifiedRuntime())) {
    return unavailable(
      "离线语音运行时没有随当前构建完整安装；本次不会录音，仍可使用文字、PDF 或 DOCX。"
    );
  }
  return LocalSpeechCapabilitySchema.parse({
    available: true,
    culture: "zh-CN",
    recognizer: `whisper.cpp ${RUNTIME_VERSION} · base-q5_1`,
    message:
      "使用随 tryrevive 打包的离线语音模型；录音只写入临时文件，转写后立即删除，不发送给 tryrevive 后端或 OpenAI。"
  });
}

export async function transcribeLocalSpeech(input: unknown): Promise<LocalSpeechResult> {
  const request = parseLocalSpeechRequest(input);
  const runtime = await getVerifiedRuntime();
  if (!runtime) throw new Error((await getLocalSpeechCapability()).message);

  const directory = await fs.mkdtemp(path.join(app.getPath("temp"), "tryrevive-speech-"));
  const audioPath = path.join(directory, "recording.wav");
  const outputBase = path.join(directory, "transcript");
  const outputPath = `${outputBase}.txt`;
  try {
    await fs.writeFile(audioPath, request.bytes, { flag: "wx" });
    const threads = Math.max(2, Math.min(8, os.availableParallelism() - 1));
    const whisperLanguage = request.culture.toLocaleLowerCase("en-US").startsWith("zh")
      ? "zh"
      : request.culture.toLocaleLowerCase("en-US").startsWith("en")
        ? "en"
        : "auto";
    const promptArguments =
      whisperLanguage === "zh" ? ["--prompt", "以下是一段简体中文普通话项目说明。"] : [];
    await execFileAsync(
      runtime.executable,
      [
        "-m",
        runtime.model,
        "-f",
        audioPath,
        "-l",
        whisperLanguage,
        ...promptArguments,
        "-otxt",
        "-of",
        outputBase,
        "-nt",
        "-np",
        "-ng",
        "-t",
        String(threads)
      ],
      { encoding: "utf8", maxBuffer: 512 * 1024, timeout: 180_000, windowsHide: true }
    );
    const transcript = normalizeSpeechTranscript(
      (await fs.readFile(outputPath, "utf8")).slice(0, 20_000),
      request.culture
    );
    if (!transcript) {
      throw new Error("没有识别出清晰语音；请靠近麦克风再试，或直接输入文字。");
    }
    return LocalSpeechResultSchema.parse({
      transcript,
      culture: request.culture,
      confidence: null
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("没有识别出清晰语音")) throw error;
    throw new Error("离线语音转写超时或中断；录音没有保存，请改用文字材料。", {
      cause: error
    });
  } finally {
    await fs.unlink(outputPath).catch(() => undefined);
    await fs.unlink(audioPath).catch(() => undefined);
    await fs.rmdir(directory).catch(() => undefined);
  }
}

async function verifiedRuntime(): Promise<{ executable: string; model: string } | null> {
  if (process.platform !== "win32") return null;
  const root = runtimeRoot();
  const executable = path.join(root, "whisper-cli.exe");
  const model = path.join(root, "ggml-base-q5_1.bin");
  const manifestPath = path.join(root, "manifest.json");
  if (![executable, model, manifestPath].every((filePath) => existsSync(filePath))) return null;
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as OfflineSpeechManifest;
    if (
      manifest.runtimeVersion !== RUNTIME_VERSION ||
      manifest.modelSha256 !== MODEL_SHA256 ||
      !manifest.files ||
      typeof manifest.files !== "object" ||
      Array.isArray(manifest.files)
    ) {
      return null;
    }
    const hashes = manifest.files as Record<string, unknown>;
    const required = [
      "whisper-cli.exe",
      "whisper.dll",
      "ggml.dll",
      "ggml-base.dll",
      "ggml-cpu-x64.dll",
      "ggml-base-q5_1.bin"
    ];
    if (!required.every((fileName) => typeof hashes[fileName] === "string")) return null;
    for (const [fileName, expectedHash] of Object.entries(hashes)) {
      if (path.basename(fileName) !== fileName || typeof expectedHash !== "string") return null;
      const filePath = path.join(root, fileName);
      if (!existsSync(filePath) || (await sha256(filePath)) !== expectedHash) return null;
    }
    return { executable, model };
  } catch {
    return null;
  }
}

function getVerifiedRuntime(): Promise<{ executable: string; model: string } | null> {
  runtimeVerification ??= verifiedRuntime();
  return runtimeVerification;
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}
