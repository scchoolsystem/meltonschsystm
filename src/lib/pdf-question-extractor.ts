// src/lib/pdf-question-extractor.ts
//
// Local replacement for the Anthropic-based PDF reading in
// api/ai-assignment-extract.ts. No AI call, no API key, no cost — just
// text extraction (unpdf, a pure-JS PDF.js wrapper that runs in Workers)
// followed by regex/rule-based question splitting, PLUS extraction of any
// embedded images AND hand-drawn vector diagrams (circles, lines, shapes —
// e.g. a labelled cell diagram drawn with PDF drawing commands rather than
// a photo) so they get attached to the question they visually belong to.
//
// Trade-off vs the AI version: this only works on PDFs with a real text
// layer and reasonably standard numbering ("1.", "2)", "Q3:", etc). It
// cannot read scanned/photographed pages (no OCR) and won't understand
// unusual layouts or multi-column papers the way a vision model can. Treat
// its output as a first-pass draft for the teacher to review/edit, same as
// the AI version already assumed.
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
// VECTOR DIAGRAMS — a separate case, same idea
// Some "diagrams" in a PDF aren't a photo/embedded image at all — they're
// drawn live with PDF path-drawing commands (e.g. a biology worksheet that
// draws a circle + a line + a text label to sketch a cell). Those never go
// through `paintImageXObject`, so the image-extraction path above finds
// nothing. We walk the same operator list a second time, this time
// decoding `constructPath` operators (PDF.js batches a run of moveTo/
// lineTo/curveTo commands into one `constructPath` call with a compact
// numeric-opcode array — see PATH_OP_CODE below) into absolute-page-space
// shapes, cluster shapes that sit close together into one diagram, pull in
// any nearby text (labels/captions) into that same diagram, and render the
// whole cluster to a small standalone SVG. That SVG is then treated exactly
// like a raster image for placement purposes — attached to whichever
// question is "open" at that point in reading order.
//
// This is a solid heuristic for the common case (single column exam paper,
// one or two diagrams per page) but it is NOT pixel-perfect layout
// analysis:
// - Multi-column layouts can confuse the top-to-bottom ordering.
// - Inline raster images (rare — small images embedded directly in the
//   content stream rather than as an XObject) are not captured, only
//   `paintImageXObject` targets are.
// - Images/shapes inside nested Form XObjects with their own transform
//   stack are approximated using the outer CTM only.
// - Vector clustering is a simple bounding-box proximity merge with a
//   minimum-size filter (see VECTOR_DIAGRAM_MIN_SIZE below) to avoid
//   turning bullet points, checkboxes, or table borders into "images". A
//   genuinely tiny or oddly-shaped hand-drawn diagram could still be missed
//   or merged incorrectly.
// - The two mini path-opcodes (`PATH_OP_CODE` below) are an internal PDF.js
//   implementation detail, not a public API — they've been stable across
//   recent PDF.js releases but aren't contractually guaranteed. If a future
//   unpdf/PDF.js upgrade changes them, vector-diagram capture silently
//   stops finding anything (falls back to plain text extraction) rather
//   than crashing; watch for that if this stops working after a dependency
//   bump.
// Treat image/diagram placement the same way as the text splitting: a good
// first-pass draft, not a guarantee.

import { extractTextItems, getDocumentProxy, getResolvedPDFJS } from "unpdf";
import type { StructuredTextItem } from "unpdf";

// `unpdf` doesn't export the PDFDocumentProxy type from its root entry
// point, so derive it from the function that returns one instead of
// reaching into unpdf's internal type paths.
type PDFDocumentProxy = Awaited<ReturnType<typeof getDocumentProxy>>;

export type ExtractedImage = {
  /** Ready-to-use `data:image/png;base64,...` or `data:image/svg+xml;base64,...` string. */
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

  const [{ items: pagesOfTextItems }, pagesOfRasterImages, vectorResult] = await Promise.all([
    extractTextItems(doc),
    extractPositionedImagesPerPage(doc),
    extractVectorDiagramsPerPage(doc),
  ]);

  // Merge raster images and rendered vector diagrams into one per-page image
  // list — from here on they're indistinguishable, just positioned tokens.
  const pagesOfImages = pagesOfRasterImages.map((rasterImages, p) => [
    ...rasterImages,
    ...(vectorResult.perPageImages[p] ?? []),
  ]);

  const tokens = buildOrderedTokenStream(pagesOfTextItems, pagesOfImages, vectorResult.perPageConsumedTextIndices);
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
  pagesOfConsumedTextIndices: Set<number>[] = [],
): LineToken[] {
  const tokens: LineToken[] = [];

  const pageCount = Math.max(pagesOfTextItems.length, pagesOfImages.length);
  for (let p = 0; p < pageCount; p++) {
    type Positioned = { y: number; order: number; token: LineToken };
    const positioned: Positioned[] = [];
    let order = 0;
    const consumed = pagesOfConsumedTextIndices[p];

    // Reconstruct lines from the flat item list, same logic as before
    // (accumulate str until hasEOL), but remember the y of the line's
    // first item so we can sort it against images. Items already folded
    // into a vector diagram's caption (see extractVectorDiagramsPerPage)
    // are skipped here so they aren't duplicated as plain question text.
    let currentLine: string[] = [];
    let currentLineY: number | null = null;
    const items = pagesOfTextItems[p] ?? [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      if (consumed?.has(itemIndex)) continue;
      const item = items[itemIndex];
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
// Vector diagram extraction: diagrams drawn live with PDF path commands
// (circles, lines, boxes — e.g. a hand-drawn cell diagram) rather than an
// embedded photo. These never hit `paintImageXObject`, so they need their
// own walk of the operator list.
// ---------------------------------------------------------------------------

// PDF.js batches a run of path-construction commands (moveTo/lineTo/
// curveTo/...) into a single `constructPath` operator whose args are
// `[paintOpCode, [flattenedNumericOpsArray | null], minMaxBboxOrNull]`.
// Inside that flattened array, each segment is tagged with a *different*,
// smaller opcode than the public `OPS` enum uses (this compact encoding
// isn't part of unpdf's/PDF.js's public API — see the file header note on
// fragility). These are the values as of the PDF.js build unpdf 1.6.x
// bundles; if a dependency bump changes them, `decodePathSegments` below
// just won't recognize any codes and vector-diagram capture quietly
// contributes nothing (existing text/raster-image extraction is
// unaffected).
const PATH_OP_CODE = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const;

type PathSegment =
  | { cmd: "M" | "L"; to: [number, number] }
  | { cmd: "C"; c1: [number, number]; c2: [number, number]; to: [number, number] }
  | { cmd: "Q"; c1: [number, number]; to: [number, number] }
  | { cmd: "Z" };

type VectorShape = {
  segments: PathSegment[];
  fill: string | null; // CSS color, or null if this path isn't filled
  stroke: string | null; // CSS color, or null if this path isn't stroked
  strokeWidth: number;
  fillRule: "nonzero" | "evenodd";
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

function applyMatrix([a, b, c, d, e, f]: Matrix, x: number, y: number): [number, number] {
  return [x * a + y * c + e, x * b + y * d + f];
}

function expandBBoxForPoint(bbox: VectorShape["bbox"], [x, y]: [number, number]) {
  if (x < bbox.minX) bbox.minX = x;
  if (y < bbox.minY) bbox.minY = y;
  if (x > bbox.maxX) bbox.maxX = x;
  if (y > bbox.maxY) bbox.maxY = y;
}

/**
 * Walks every page's operator list a second time (separate from
 * `extractPositionedImagesPerPage`, which only looks at raster
 * `paintImageXObject` calls) to find vector-drawn shapes, clusters nearby
 * shapes + any text sitting inside/near the cluster into one diagram, and
 * renders each cluster to a small standalone SVG positioned the same way a
 * raster image would be (see `extractPositionedImagesPerPage`'s docs).
 *
 * Returns both the rendered images (per page) and the set of text-item
 * indices (per page, indices into `extractTextItems`' flat item list) that
 * got folded into a diagram's caption — the caller should skip those when
 * building ordinary question-text lines so a caption like "Nucleus" isn't
 * both baked into the diagram image AND left dangling as stray body text.
 */
async function extractVectorDiagramsPerPage(
  doc: PDFDocumentProxy,
): Promise<{
  perPageImages: { y: number; image: ExtractedImage }[][];
  perPageConsumedTextIndices: Set<number>[];
}> {
  const { OPS } = await getResolvedPDFJS();
  const { items: pagesOfTextItems } = await extractTextItems(doc);

  const perPageImages: { y: number; image: ExtractedImage }[][] = [];
  const perPageConsumedTextIndices: Set<number>[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const operatorList = await page.getOperatorList();

    const shapes: VectorShape[] = [];
    const stack: Matrix[] = [];
    let ctm: Matrix = IDENTITY;
    let fillColor: string = "#000000";
    let strokeColor: string = "#000000";
    let lineWidth = 1;

    const toColor = (arg: unknown): string => {
      if (typeof arg === "string") return arg; // already "#rrggbb"
      if (typeof arg === "number") {
        const v = Math.round(Math.max(0, Math.min(1, arg)) * 255)
          .toString(16)
          .padStart(2, "0");
        return `#${v}${v}${v}`;
      }
      return "#000000";
    };

    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const op = operatorList.fnArray[i];
      const args = operatorList.argsArray[i];

      if (op === OPS.save) {
        stack.push(ctm);
      } else if (op === OPS.restore) {
        ctm = stack.pop() ?? IDENTITY;
      } else if (op === OPS.transform) {
        ctm = multiply([args[0], args[1], args[2], args[3], args[4], args[5]], ctm);
      } else if (op === OPS.setFillRGBColor || op === OPS.setFillGray) {
        fillColor = toColor(args[0]);
      } else if (op === OPS.setStrokeRGBColor || op === OPS.setStrokeGray) {
        strokeColor = toColor(args[0]);
      } else if (op === OPS.setLineWidth) {
        lineWidth = typeof args[0] === "number" ? args[0] : 1;
      } else if (op === OPS.constructPath) {
        const [paintOp, floatsHolder] = args as [number, [Float32Array | null]];
        const floats = floatsHolder?.[0];
        if (!floats || floats.length === 0) continue;

        const segments: PathSegment[] = [];
        const bbox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        let j = 0;
        let ok = true;
        while (j < floats.length) {
          const code = floats[j];
          if (code === PATH_OP_CODE.moveTo) {
            const p = applyMatrix(ctm, floats[j + 1], floats[j + 2]);
            segments.push({ cmd: "M", to: p });
            expandBBoxForPoint(bbox, p);
            j += 3;
          } else if (code === PATH_OP_CODE.lineTo) {
            const p = applyMatrix(ctm, floats[j + 1], floats[j + 2]);
            segments.push({ cmd: "L", to: p });
            expandBBoxForPoint(bbox, p);
            j += 3;
          } else if (code === PATH_OP_CODE.curveTo) {
            const c1 = applyMatrix(ctm, floats[j + 1], floats[j + 2]);
            const c2 = applyMatrix(ctm, floats[j + 3], floats[j + 4]);
            const to = applyMatrix(ctm, floats[j + 5], floats[j + 6]);
            segments.push({ cmd: "C", c1, c2, to });
            expandBBoxForPoint(bbox, c1);
            expandBBoxForPoint(bbox, c2);
            expandBBoxForPoint(bbox, to);
            j += 7;
          } else if (code === PATH_OP_CODE.quadraticCurveTo) {
            const c1 = applyMatrix(ctm, floats[j + 1], floats[j + 2]);
            const to = applyMatrix(ctm, floats[j + 3], floats[j + 4]);
            segments.push({ cmd: "Q", c1, to });
            expandBBoxForPoint(bbox, c1);
            expandBBoxForPoint(bbox, to);
            j += 5;
          } else if (code === PATH_OP_CODE.closePath) {
            segments.push({ cmd: "Z" });
            j += 1;
          } else {
            // Unrecognized compact opcode — this build of PDF.js encodes
            // paths differently than PATH_OP_CODE assumes. Bail out of
            // vector-diagram capture entirely rather than guess wrong.
            ok = false;
            break;
          }
        }
        if (!ok || segments.length === 0) continue;

        const fillPaint = [
          OPS.fill,
          OPS.eoFill,
          OPS.fillStroke,
          OPS.eoFillStroke,
          OPS.closeFillStroke,
          OPS.closeEOFillStroke,
        ].includes(paintOp);
        const strokePaint = [
          OPS.stroke,
          OPS.closeStroke,
          OPS.fillStroke,
          OPS.eoFillStroke,
          OPS.closeFillStroke,
          OPS.closeEOFillStroke,
        ].includes(paintOp);
        if (!fillPaint && !strokePaint) continue; // e.g. endPath from a clip-only `W n` — nothing visible drawn

        const fillRule: "nonzero" | "evenodd" = [OPS.eoFill, OPS.eoFillStroke, OPS.closeEOFillStroke].includes(
          paintOp,
        )
          ? "evenodd"
          : "nonzero";

        shapes.push({
          segments,
          fill: fillPaint ? fillColor : null,
          stroke: strokePaint ? strokeColor : null,
          strokeWidth: lineWidth,
          fillRule,
          bbox,
        });
      }
    }

    const { images, consumedTextIndices } = clusterShapesIntoDiagrams(shapes, pagesOfTextItems[pageNumber - 1] ?? []);
    perPageImages.push(images);
    perPageConsumedTextIndices.push(consumedTextIndices);
  }

  return { perPageImages, perPageConsumedTextIndices };
}

// A cluster needs at least this much real 2D extent in both dimensions
// (PDF units, ~1/72in) to count as a diagram. Filters out single-line
// table borders/rules and small bullet/checkbox marks, which are wide-or-
// tall-but-thin, or tiny, respectively — neither is a "diagram" a teacher
// would want to see re-attached to a question.
const VECTOR_DIAGRAM_MIN_SIZE = 15;
// How far apart (in PDF units) two shapes can be and still be considered
// "the same diagram" — generous enough to bridge a label's connector line
// without merging unrelated shapes elsewhere on the page.
const VECTOR_CLUSTER_MERGE_MARGIN = 25;
// Extra margin around a finished shape cluster's bbox to pull in caption
// text sitting just above/below/beside it.
const VECTOR_CAPTION_MARGIN = 20;
// Padding (PDF units) added around the final cluster bbox in the rendered
// SVG's viewBox, so strokes/text at the very edge aren't clipped.
const VECTOR_SVG_PADDING = 8;

function bboxesOverlapWithMargin(a: VectorShape["bbox"], b: VectorShape["bbox"], margin: number): boolean {
  return (
    a.minX - margin <= b.maxX &&
    b.minX - margin <= a.maxX &&
    a.minY - margin <= b.maxY &&
    b.minY - margin <= a.maxY
  );
}

function unionBBox(a: VectorShape["bbox"], b: VectorShape["bbox"]): VectorShape["bbox"] {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function clusterShapesIntoDiagrams(
  shapes: VectorShape[],
  textItems: StructuredTextItem[],
): { images: { y: number; image: ExtractedImage }[]; consumedTextIndices: Set<number> } {
  // Iteratively merge any two shapes whose (margin-padded) bboxes overlap,
  // until nothing more merges. Simple O(n^2) passes — page shape counts in
  // real documents are small (tens, not thousands), so this is plenty fast.
  type Cluster = { shapes: VectorShape[]; bbox: VectorShape["bbox"] };
  let clusters: Cluster[] = shapes.map((s) => ({ shapes: [s], bbox: s.bbox }));

  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (bboxesOverlapWithMargin(clusters[i].bbox, clusters[j].bbox, VECTOR_CLUSTER_MERGE_MARGIN)) {
          clusters[i] = {
            shapes: [...clusters[i].shapes, ...clusters[j].shapes],
            bbox: unionBBox(clusters[i].bbox, clusters[j].bbox),
          };
          clusters.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  // Drop clusters too small/thin to be a real diagram.
  clusters = clusters.filter(
    (c) => c.bbox.maxX - c.bbox.minX >= VECTOR_DIAGRAM_MIN_SIZE && c.bbox.maxY - c.bbox.minY >= VECTOR_DIAGRAM_MIN_SIZE,
  );

  const images: { y: number; image: ExtractedImage }[] = [];
  const consumedTextIndices = new Set<number>();

  for (const cluster of clusters) {
    const captionBox = {
      minX: cluster.bbox.minX - VECTOR_CAPTION_MARGIN,
      minY: cluster.bbox.minY - VECTOR_CAPTION_MARGIN,
      maxX: cluster.bbox.maxX + VECTOR_CAPTION_MARGIN,
      maxY: cluster.bbox.maxY + VECTOR_CAPTION_MARGIN,
    };
    const captionItems: { item: StructuredTextItem; index: number }[] = [];
    let finalBox = { ...cluster.bbox };
    textItems.forEach((item, index) => {
      if (!item.str.trim()) return;
      if (item.x >= captionBox.minX && item.x <= captionBox.maxX && item.y >= captionBox.minY && item.y <= captionBox.maxY) {
        captionItems.push({ item, index });
        finalBox = unionBBox(finalBox, { minX: item.x, minY: item.y, maxX: item.x + item.width, maxY: item.y + item.height });
        consumedTextIndices.add(index);
      }
    });

    const dataUrl = renderVectorClusterToSvgDataUrl(cluster.shapes, captionItems.map((c) => c.item), finalBox);
    const width = Math.round(finalBox.maxX - finalBox.minX + 2 * VECTOR_SVG_PADDING);
    const height = Math.round(finalBox.maxY - finalBox.minY + 2 * VECTOR_SVG_PADDING);
    images.push({ y: finalBox.maxY, image: { dataUrl, width, height } });
  }

  return { images, consumedTextIndices };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Renders a cluster of vector shapes (+ any captured caption text) to a
 * standalone SVG. Coordinates are flipped from PDF space (origin
 * bottom-left, y-up) to SVG space (origin top-left, y-down) relative to
 * the cluster's own bounding box, so the SVG is self-contained and doesn't
 * need the page's full height.
 */
function renderVectorClusterToSvgDataUrl(
  shapes: VectorShape[],
  captionItems: StructuredTextItem[],
  bbox: VectorShape["bbox"],
): string {
  const pad = VECTOR_SVG_PADDING;
  const flip = (x: number, y: number): [number, number] => [x - bbox.minX + pad, bbox.maxY - y + pad];

  const pathElements = shapes.map((shape) => {
    let d = "";
    for (const seg of shape.segments) {
      if (seg.cmd === "M") {
        const [x, y] = flip(...seg.to);
        d += `M ${x.toFixed(2)} ${y.toFixed(2)} `;
      } else if (seg.cmd === "L") {
        const [x, y] = flip(...seg.to);
        d += `L ${x.toFixed(2)} ${y.toFixed(2)} `;
      } else if (seg.cmd === "C") {
        const [x1, y1] = flip(...seg.c1);
        const [x2, y2] = flip(...seg.c2);
        const [x, y] = flip(...seg.to);
        d += `C ${x1.toFixed(2)} ${y1.toFixed(2)}, ${x2.toFixed(2)} ${y2.toFixed(2)}, ${x.toFixed(2)} ${y.toFixed(2)} `;
      } else if (seg.cmd === "Q") {
        const [x1, y1] = flip(...seg.c1);
        const [x, y] = flip(...seg.to);
        d += `Q ${x1.toFixed(2)} ${y1.toFixed(2)}, ${x.toFixed(2)} ${y.toFixed(2)} `;
      } else if (seg.cmd === "Z") {
        d += "Z ";
      }
    }
    const fillAttr = shape.fill ? `fill="${shape.fill}" fill-rule="${shape.fillRule}"` : `fill="none"`;
    const strokeAttr = shape.stroke ? `stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}"` : "";
    return `<path d="${d.trim()}" ${fillAttr} ${strokeAttr} />`;
  });

  const textElements = captionItems.map((item) => {
    const [x, y] = flip(item.x, item.y);
    const fontSize = Math.max(item.fontSize, 6);
    return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${fontSize}" font-family="sans-serif" fill="#000000">${escapeXml(item.str)}</text>`;
  });

  const width = bbox.maxX - bbox.minX + 2 * pad;
  const height = bbox.maxY - bbox.minY + 2 * pad;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}" ` +
    `width="${Math.round(width)}" height="${Math.round(height)}">` +
    `<rect x="0" y="0" width="${width.toFixed(2)}" height="${height.toFixed(2)}" fill="#ffffff" />` +
    pathElements.join("") +
    textElements.join("") +
    `</svg>`;

  return `data:image/svg+xml;base64,${bytesToBase64(new TextEncoder().encode(svg))}`;
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
