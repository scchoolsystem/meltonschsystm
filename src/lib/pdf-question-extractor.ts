// src/lib/pdf-question-extractor.ts
//
// Local replacement for the Anthropic-based PDF reading in
// api/ai-assignment-extract.ts. No AI call, no API key, no cost — just
// text extraction (unpdf, a pure-JS PDF.js wrapper that runs in Workers)
// followed by regex/rule-based question splitting, PLUS extraction of any
// embedded images (diagrams, figures, photos) so they get attached to the
// question they visually belong to.
//
// Trade-off vs the AI version: this only works on PDFs with a real text
// layer and reasonably standard numbering ("1.", "2)", "Q3:", etc). It
// cannot read scanned/photographed pages (no OCR) and won't understand
// unusual layouts, multi-column papers, or genuine diagrams the way a
// vision model can. Treat its output as a first-pass draft for the
// teacher to review/edit, same as the AI version already assumed.
//
// IMAGE PLACEMENT — HOW IT WORKS AND ITS LIMITS
// unpdf's `extractImages()` gives you image pixels but no position on the
// page. To place an image "correctly" we instead walk the page's operator
// list ourselves (same primitive unpdf uses internally), track the current
// transformation matrix (CTM) through save/restore/transform ops, and read
// off the (x, y) at each `paintImageXObject` call. That (x, y) is compared
// against the (x, y) of every text line on the page (from
// `extractTextItems`, same coordinate space: PDF user space, origin
// bottom-left, y increases upward) to slot the image into the right place
// in reading order, then whichever question block is "open" at that point
// in the stream claims the image.
//
// This is a solid heuristic for the common case (single column exam paper,
// one or two diagrams per page, image roughly between the question that
// introduces it and the next question number) but it is NOT pixel-perfect
// layout analysis:
// - Multi-column layouts can confuse the top-to-bottom ordering.
// - Inline images (rare — small images embedded directly in the content
//   stream rather than as an XObject) are not captured, only
//   `paintImageXObject` targets are.
// - Images inside nested Form XObjects with their own transform stack
//   are approximated using the outer CTM only.
// Treat image placement the same way as the text splitting: a good
// first-pass draft, not a guarantee.

import { extractTextItems, getDocumentProxy, getResolvedPDFJS } from "unpdf";
import type { StructuredTextItem } from "unpdf";

// `unpdf` doesn't export the PDFDocumentProxy type from its root entry
// point, so derive it from the function that returns one instead of
// reaching into unpdf's internal type paths.
type PDFDocumentProxy = Awaited<ReturnType<typeof getDocumentProxy>>;

export type ExtractedImage = {
  /** Ready-to-use `data:image/png;base64,...` string. */
  dataUrl: string;
  width: number;
  height: number;
};

export type ExtractedQuestion = {
  id: string;
  type: "text" | "mcq" | "diagram";
  text: string;
  options?: string[];
  images?: ExtractedImage[];
  max_marks: number;
};

// ---------------------------------------------------------------------------
// Regexes (unchanged from the text-only version)
// ---------------------------------------------------------------------------

// Matches a line starting a new question: "1.", "2)", "Q3.", "Question 4:"
const Q_START = /^(?:q(?:uestion)?\.?\s*)?(\d{1,3})[.)]\s*(.*)$/i;

// Matches an MCQ option line: "A.", "b)", etc, followed by the option text.
const OPTION_START = /^([A-Za-z])[.)]\s+(.+)$/;

// Some papers put every option on its own line ("A. Nucleus\nB. Ribosome"),
// but many cram all of them onto one line instead:
// "A. Nucleus B. Ribosome C. Mitochondrion D. Vacuole". Detect that shape
// and split it into separate options. Requires the letters to start at A
// and run consecutively (A, B, C, D...) so this doesn't misfire on
// unrelated text that happens to contain "B." or "C." mid-sentence.
function extractInlineOptions(line: string): string[] | null {
  const matches = [...line.matchAll(/\b([A-Z])\.\s+/g)];
  if (matches.length < 2) return null;
  const letters = matches.map((m) => m[1]);
  const expected = letters.map((_, i) => String.fromCharCode(65 + i));
  if (JSON.stringify(letters) !== JSON.stringify(expected)) return null;

  const options: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index! + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : line.length;
    const opt = line.slice(start, end).trim();
    if (!opt) return null; // malformed match — bail rather than push an empty option
    options.push(opt);
  }
  return options;
}

// Matches a marks annotation anywhere in the question text, e.g.
// "(5 marks)", "[10 mks]", "(2 mk)".
const MARKS_PATTERN = /[([]\s*(\d{1,3})\s*(?:marks?|mks?)\s*[)\]]/i;

// Words that strongly suggest the question wants a drawn/visual answer
// rather than a written one.
const DIAGRAM_WORDS = /\b(draw|sketch|label|plot|diagram|graph|illustrate)\b/i;

// Lines that are section scaffolding, not questions — dropped even if they
// slip into a question block (e.g. a stray "SECTION B" between questions).
const NOISE_LINE = /^(section\s+[a-z0-9]+|instructions?( to candidates)?:?|answer all questions.*|part\s+[a-z0-9]+)$/i;

// ---------------------------------------------------------------------------
// Legacy text-only API — kept as-is for any existing callers.
// ---------------------------------------------------------------------------

export async function extractTextFromPdf(base64: string): Promise<string> {
  const { extractText } = await import("unpdf");
  const bytes = base64ToBytes(base64);
  const doc = await getDocumentProxy(bytes);
  const { text } = await extractText(doc, { mergePages: false });
  // Join pages with a blank line so a question never accidentally merges
  // with the next page's header/footer text.
  return text.join("\n\n");
}

export function parseQuestionsFromText(rawText: string): ExtractedQuestion[] {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !NOISE_LINE.test(l));

  return buildQuestionsFromLineStream(lines.map((str) => ({ kind: "text" as const, str })));
}

// ---------------------------------------------------------------------------
// New API: text + images, correctly interleaved.
// ---------------------------------------------------------------------------

/**
 * Extracts questions (and any images that belong to them) from a PDF that
 * has a real text layer. This is the function you want for the assignment
 * extractor route.
 */
export async function extractQuestionsFromPdf(base64: string): Promise<ExtractedQuestion[]> {
  const bytes = base64ToBytes(base64);
  const doc = await getDocumentProxy(bytes);

  const [{ items: pagesOfTextItems }, pagesOfImageTokens] = await Promise.all([
    extractTextItems(doc),
    extractPositionedImagesPerPage(doc),
  ]);

  const tokens = buildOrderedTokenStream(pagesOfTextItems, pagesOfImageTokens);
  return buildQuestionsFromLineStream(tokens);
}

// A single item in the reading-order stream we feed into the question
// splitter: either one line of text, or one image that sits at this point
// in the flow.
type LineToken =
  | { kind: "text"; str: string }
  | { kind: "image"; image: ExtractedImage };

/**
 * Groups the flat per-page text items into lines (splitting on `hasEOL`,
 * same as the original PDF.js-based join did), tags each line and each
 * image with its page + y position, then sorts everything within a page by
 * y descending (PDF space: bigger y = higher up the page = earlier in
 * reading order) to produce one ordered token stream across the whole
 * document.
 */
function buildOrderedTokenStream(
  pagesOfTextItems: StructuredTextItem[][],
  pagesOfImages: { y: number; image: ExtractedImage }[][],
): LineToken[] {
  const tokens: LineToken[] = [];

  const pageCount = Math.max(pagesOfTextItems.length, pagesOfImages.length);
  for (let p = 0; p < pageCount; p++) {
    type Positioned = { y: number; order: number; token: LineToken };
    const positioned: Positioned[] = [];
    let order = 0;

    // Reconstruct lines from the flat item list, same logic as before
    // (accumulate str until hasEOL), but remember the y of the line's
    // first item so we can sort it against images.
    let currentLine: string[] = [];
    let currentLineY: number | null = null;
    const items = pagesOfTextItems[p] ?? [];
    for (const item of items) {
      if (currentLineY === null) currentLineY = item.y;
      currentLine.push(item.str);
      if (item.hasEOL) {
        const str = currentLine.join("").trim();
        if (str.length > 0 && !NOISE_LINE.test(str)) {
          positioned.push({ y: currentLineY, order: order++, token: { kind: "text", str } });
        }
        currentLine = [];
        currentLineY = null;
      }
    }
    if (currentLine.length > 0) {
      const str = currentLine.join("").trim();
      if (str.length > 0 && !NOISE_LINE.test(str)) {
        positioned.push({ y: currentLineY ?? 0, order: order++, token: { kind: "text", str } });
      }
    }

    for (const { y, image } of pagesOfImages[p] ?? []) {
      positioned.push({ y, order: order++, token: { kind: "image", image } });
    }

    // Sort by y descending (top of page first). Ties (e.g. an image and
    // the line right next to it) fall back to the order they were
    // encountered in their own source (text items are already in stream
    // order; images are appended after, which in practice reads fine
    // since most exam diagrams sit below the line that introduces them).
    positioned.sort((a, b) => (b.y - a.y) || (a.order - b.order));
    tokens.push(...positioned.map((p2) => p2.token));
  }

  return tokens;
}

/**
 * Builds the ExtractedQuestion[] from an ordered stream of text lines and
 * images. Shared by both the legacy text-only path and the new image-aware
 * path.
 */
function buildQuestionsFromLineStream(tokens: LineToken[]): ExtractedQuestion[] {
  type Block = { lines: string[]; images: ExtractedImage[] };
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const token of tokens) {
    if (token.kind === "image") {
      // An image before any question number is recognized has nowhere to
      // go (e.g. a school badge in the header) — drop it, same as stray
      // preamble text is already dropped below.
      if (current) current.images.push(token.image);
      continue;
    }

    const line = token.str;
    const m = line.match(Q_START);
    if (m) {
      if (current) blocks.push(current);
      current = { lines: m[2] ? [m[2]] : [], images: [] };
    } else if (current) {
      current.lines.push(line);
    }
    // Lines before the first recognized question number (title, byline,
    // "answer all questions" preamble) are intentionally dropped — there's
    // no `current` block yet to push them into.
  }
  if (current) blocks.push(current);

  return blocks
    .map((block) => {
      const optionLines: string[] = [];
      const bodyLines: string[] = [];

      for (const line of block.lines) {
        const inline = extractInlineOptions(line);
        if (inline) {
          optionLines.push(...inline);
          continue;
        }
        const om = line.match(OPTION_START);
        if (om) optionLines.push(om[2].trim());
        else bodyLines.push(line);
      }

      let text = bodyLines.join(" ").replace(/\s+/g, " ").trim();

      const marksMatch = text.match(MARKS_PATTERN);
      const max_marks = marksMatch ? Number(marksMatch[1]) : 5;
      text = text.replace(MARKS_PATTERN, "").replace(/\s+/g, " ").trim();

      let type: ExtractedQuestion["type"] = "text";
      if (optionLines.length >= 2) type = "mcq";
      else if (DIAGRAM_WORDS.test(text) || block.images.length > 0) type = "diagram";

      return {
        id: crypto.randomUUID(),
        type,
        text,
        ...(type === "mcq" ? { options: optionLines } : {}),
        ...(block.images.length > 0 ? { images: block.images } : {}),
        max_marks: Number.isFinite(max_marks) && max_marks > 0 ? max_marks : 5,
      };
    })
    .filter((q) => q.text.length > 0 || (q.images?.length ?? 0) > 0);
}

// ---------------------------------------------------------------------------
// Image extraction: walk the operator list ourselves so we get a position,
// not just pixels (unpdf's own `extractImages` only gives pixels).
// ---------------------------------------------------------------------------

type Matrix = [number, number, number, number, number, number]; // a b c d e f

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

// PDF "cm" concatenation: the new matrix is premultiplied into the CTM, i.e.
// a point is transformed by `m` first, then by the existing `ctm`.
function multiply(m: Matrix, ctm: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m;
  const [a2, b2, c2, d2, e2, f2] = ctm;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

async function extractPositionedImagesPerPage(
  doc: PDFDocumentProxy,
): Promise<{ y: number; image: ExtractedImage }[][]> {
  const { OPS } = await getResolvedPDFJS();
  const result: { y: number; image: ExtractedImage }[][] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const operatorList = await page.getOperatorList();

    const pageImages: { y: number; image: ExtractedImage }[] = [];
    const stack: Matrix[] = [];
    let ctm: Matrix = IDENTITY;

    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const op = operatorList.fnArray[i];

      if (op === OPS.save) {
        stack.push(ctm);
      } else if (op === OPS.restore) {
        ctm = stack.pop() ?? IDENTITY;
      } else if (op === OPS.transform) {
        const args = operatorList.argsArray[i] as number[];
        ctm = multiply([args[0], args[1], args[2], args[3], args[4], args[5]], ctm);
      } else if (op === OPS.paintImageXObject) {
        const imageKey = operatorList.argsArray[i][0] as string;
        const raw = await new Promise<any>((resolve) =>
          (imageKey.startsWith("g_") ? page.commonObjs : page.objs).get(imageKey, resolve),
        );
        if (!raw?.data || !raw.width || !raw.height) continue;

        const channels = raw.data.length / (raw.width * raw.height);
        if (channels !== 1 && channels !== 3 && channels !== 4) continue;

        try {
          const dataUrl = await encodeRawImageToPngDataUrl(
            raw.data as Uint8ClampedArray,
            raw.width,
            raw.height,
            channels as 1 | 3 | 4,
          );
          // The unit image square's origin maps to (ctm.e, ctm.f) — use
          // that as the image's position for reading-order comparisons.
          pageImages.push({ y: ctm[5], image: { dataUrl, width: raw.width, height: raw.height } });
        } catch {
          // Encoding failure for one image shouldn't sink the whole page —
          // skip it, the question text still comes through fine.
          continue;
        }
      }
    }

    result.push(pageImages);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Minimal Workers-safe PNG encoder (no Buffer, no `zlib`, no `pngjs`).
// Uses the standard `CompressionStream('deflate')`, which is available in
// Cloudflare Workers and produces the zlib-wrapped deflate stream PNG's
// IDAT chunk requires.
// ---------------------------------------------------------------------------

async function encodeRawImageToPngDataUrl(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  channels: 1 | 3 | 4,
): Promise<string> {
  const colorType = channels === 1 ? 0 : channels === 3 ? 2 : 6;

  // Build raw scanlines: one filter byte (0 = "None") + row pixels.
  const rowBytes = width * channels;
  const raw = new Uint8Array(height * (1 + rowBytes));
  for (let y = 0; y < height; y++) {
    const srcOffset = y * rowBytes;
    const dstOffset = y * (1 + rowBytes);
    raw[dstOffset] = 0; // filter type: None
    raw.set(data.subarray(srcOffset, srcOffset + rowBytes), dstOffset + 1);
  }

  const compressed = await deflate(raw);

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method

  const png = concatBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    buildChunk("IHDR", ihdr),
    buildChunk("IDAT", compressed),
    buildChunk("IEND", new Uint8Array(0)),
  ]);

  return `data:image/png;base64,${bytesToBase64(png)}`;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  // 'deflate' (as opposed to 'deflate-raw') produces a zlib stream
  // (RFC 1950), which is exactly what a PNG IDAT chunk expects.
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  // `.slice()` copies onto a plain (non-shared) ArrayBuffer, which keeps
  // strict DOM lib typings happy across TS versions.
  writer.write(data.slice());
  writer.close();

  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return concatBytes(chunks);
}

function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, data.length);

  const crcInput = concatBytes([typeBytes, data]);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(crcInput));

  return concatBytes([length, typeBytes, data, crc]);
}

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// btoa chokes on large binary strings built via one giant String.fromCharCode
// call (arg count limits), so chunk it.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
