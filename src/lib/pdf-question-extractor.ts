// src/lib/pdf-question-extractor.ts
//
// Local replacement for the Anthropic-based PDF reading in
// api/ai-assignment-extract.ts. No AI call, no API key, no cost — just
// text extraction (unpdf, a pure-JS PDF.js wrapper that runs in Workers)
// followed by regex/rule-based question splitting.
//
// Trade-off vs the AI version: this only works on PDFs with a real text
// layer and reasonably standard numbering ("1.", "2)", "Q3:", etc). It
// cannot read scanned/photographed pages (no OCR) and won't understand
// unusual layouts, multi-column papers, or genuine diagrams the way a
// vision model can. Treat its output as a first-pass draft for the
// teacher to review/edit, same as the AI version already assumed.

import { extractText, getDocumentProxy } from "unpdf";

export type ExtractedQuestion = {
  id: string;
  type: "text" | "mcq" | "diagram";
  text: string;
  options?: string[];
  max_marks: number;
};

// Matches a line starting a new question: "1.", "2)", "Q3.", "Question 4:"
const Q_START = /^(?:q(?:uestion)?\.?\s*)?(\d{1,3})[.)]\s*(.*)$/i;

// Matches an MCQ option line: "A.", "b)", etc, followed by the option text.
const OPTION_START = /^([A-Za-z])[.)]\s+(.+)$/;

// Matches a marks annotation anywhere in the question text, e.g.
// "(5 marks)", "[10 mks]", "(2 mk)".
const MARKS_PATTERN = /[([]\s*(\d{1,3})\s*(?:marks?|mks?)\s*[)\]]/i;

// Words that strongly suggest the question wants a drawn/visual answer
// rather than a written one.
const DIAGRAM_WORDS = /\b(draw|sketch|label|plot|diagram|graph|illustrate)\b/i;

// Lines that are section scaffolding, not questions — dropped even if they
// slip into a question block (e.g. a stray "SECTION B" between questions).
const NOISE_LINE = /^(section\s+[a-z0-9]+|instructions?( to candidates)?:?|answer all questions.*|part\s+[a-z0-9]+)$/i;

export async function extractTextFromPdf(base64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
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

  type Block = { lines: string[] };
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const line of lines) {
    const m = line.match(Q_START);
    if (m) {
      if (current) blocks.push(current);
      current = { lines: m[2] ? [m[2]] : [] };
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
      else if (DIAGRAM_WORDS.test(text)) type = "diagram";

      return {
        id: crypto.randomUUID(),
        type,
        text,
        ...(type === "mcq" ? { options: optionLines } : {}),
        max_marks: Number.isFinite(max_marks) && max_marks > 0 ? max_marks : 5,
      };
    })
    .filter((q) => q.text.length > 0);
}
