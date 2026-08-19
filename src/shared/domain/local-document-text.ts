import { strFromU8, unzipSync } from "fflate";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export const MAX_LOCAL_PDF_PAGES = 80;
export const MAX_LOCAL_PDF_PROCESSING_MS = 10_000;
export const MAX_LOCAL_DOCX_XML_BYTES = 2 * 1024 * 1024;

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t\u00a0 ]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function isPdfHeader(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && strFromU8(bytes.subarray(0, 5)) === "%PDF-";
}

function isZipHeader(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(bytes[2] ?? -1) &&
    [0x04, 0x06, 0x08].includes(bytes[3] ?? -1)
  );
}

function textFromWordXml(xml: string): string {
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  if (parsed.querySelector("parsererror")) throw new Error("invalid_xml");

  const paragraphs = [...parsed.getElementsByTagNameNS("*", "p")];
  return normalizeExtractedText(
    paragraphs
      .map((paragraph) => {
        let text = "";
        for (const element of paragraph.querySelectorAll("*")) {
          if (element.localName === "t") text += element.textContent ?? "";
          if (element.localName === "tab") text += "\t";
          if (element.localName === "br" || element.localName === "cr") text += "\n";
        }
        return text;
      })
      .join("\n")
  );
}

export function extractDocxText(bytes: Uint8Array): string {
  if (!isZipHeader(bytes)) throw new Error("invalid_docx");

  let mainDocumentTooLarge = false;
  let mainDocumentSeen = false;
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes, {
      filter(file) {
        if (file.name !== "word/document.xml") return false;
        mainDocumentSeen = true;
        if (file.originalSize > MAX_LOCAL_DOCX_XML_BYTES) {
          mainDocumentTooLarge = true;
          return false;
        }
        return true;
      }
    });
  } catch (error) {
    throw new Error("invalid_docx", { cause: error });
  }

  if (mainDocumentTooLarge) throw new Error("docx_text_too_large");
  const documentXml = unzipped["word/document.xml"];
  if (!mainDocumentSeen || !documentXml) throw new Error("invalid_docx");
  if (documentXml.byteLength > MAX_LOCAL_DOCX_XML_BYTES) {
    throw new Error("docx_text_too_large");
  }

  try {
    return textFromWordXml(strFromU8(documentXml));
  } catch (error) {
    throw new Error("invalid_docx", { cause: error });
  }
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  if (!isPdfHeader(bytes)) throw new Error("invalid_pdf");

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    disableAutoFetch: true,
    disableFontFace: true,
    disableStream: true,
    isImageDecoderSupported: false,
    isOffscreenCanvasSupported: false,
    maxImageSize: 1,
    stopAtErrors: true,
    useSystemFonts: false,
    useWasm: false,
    useWorkerFetch: false
  });

  let document: Awaited<typeof loadingTask.promise> | null = null;
  let timedOut = false;
  let timeoutDestroy: Promise<void> | null = null;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    timeoutDestroy = loadingTask.destroy();
  }, MAX_LOCAL_PDF_PROCESSING_MS);
  try {
    document = await loadingTask.promise;
    if (document.numPages > MAX_LOCAL_PDF_PAGES) throw new Error("pdf_page_limit");

    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : ""))
        .join("");
      const normalized = normalizeExtractedText(pageText);
      if (normalized) pages.push(`【第 ${pageNumber} 页】\n${normalized}`);
      page.cleanup();
    }
    return normalizeExtractedText(pages.join("\n\n"));
  } catch (error) {
    if (timedOut) throw new Error("pdf_processing_timeout", { cause: error });
    if (error instanceof Error && error.message === "pdf_page_limit") throw error;
    if (error instanceof Error && error.name === "PasswordException") {
      throw new Error("password_protected_pdf", { cause: error });
    }
    throw new Error("invalid_pdf", { cause: error });
  } finally {
    globalThis.clearTimeout(timeout);
    if (document && !timedOut) document.cleanup();
    await (timeoutDestroy ?? loadingTask.destroy());
  }
}
