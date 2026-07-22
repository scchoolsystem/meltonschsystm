// src/routes/api/ai-assignment-extract.ts
//
// Teacher uploads a PDF (or photographed/scanned question paper) when creating
// an assignment. This route sends it to the Anthropic API, which reads the
// document directly (so it handles multi-column layouts, tables, diagrams and
// scanned pages — not just a plain text layer) and returns a structured list
// of questions matching this app's Question shape. The frontend drops that
// straight into the Questions builder so a teacher reviews/edits before
// publishing, rather than students just being handed the raw PDF to answer on
// paper.
//
// Required Cloudflare Worker secret (set via `wrangler secret put`):
//   ANTHROPIC_API_KEY

import { createFileRoute } from "@tanstack/react-router";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL = "claude-sonnet-5";
const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15MB raw file (base64 is ~33% bigger on the wire)

type ExtractedQuestion = {
  id: string;
  type: "text" | "mcq" | "diagram";
  text: string;
  options?: string[];
  max_marks: number;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Claude may wrap the JSON in a sentence or code fence despite instructions —
// pull out the first top-level [...] array rather than assuming pure JSON.
function extractJsonArray(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Could not find a JSON array in the model's response");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export const Route = createFileRoute("/api/ai-assignment-extract")({
  server: {
    middleware: [requireSupabaseAuth],
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          return jsonResponse(
            { error: "AI extraction isn't configured yet — add the ANTHROPIC_API_KEY Cloudflare Worker secret." },
            503,
          );
        }

        let body: { pdfBase64?: string; fileName?: string };
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Bad JSON body" }, 400);
        }

        const { pdfBase64, fileName } = body;
        if (!pdfBase64 || typeof pdfBase64 !== "string") {
          return jsonResponse({ error: "pdfBase64 is required" }, 400);
        }

        // Rough size guard — base64 encodes 3 bytes as 4 chars.
        const approxBytes = (pdfBase64.length * 3) / 4;
        if (approxBytes > MAX_PDF_BYTES) {
          return jsonResponse(
            { error: `PDF is too large (~${Math.round(approxBytes / 1024 / 1024)}MB). Please upload a file under 15MB.` },
            413,
          );
        }

        const instructions = `You are reading a school assignment / exam question paper${fileName ? ` named "${fileName}"` : ""}. Extract every question a student needs to answer into a JSON array — nothing else in your response, no preamble, no markdown fences.

Each array item must be an object with exactly these fields:
- "type": "mcq" if the question offers lettered/numbered choices to pick from, "diagram" if it asks the student to draw, sketch, label, or plot something, otherwise "text".
- "text": the full question text, renumbered starting at 1 if the source uses its own numbering. Include any sub-parts (a), (b), (i), (ii) etc. within the same "text" field as one combined question unless they clearly carry separate mark allocations, in which case split them into separate array items.
- "options": for "mcq" only — an array of the choice strings, WITHOUT their letter/number prefix. Omit this field entirely for non-mcq questions.
- "max_marks": the marks allocated to that question as a number. If the paper states marks (e.g. "(5 marks)", "[10 mks]"), use that exact number. If no marks are stated anywhere in the document, use 5 for every question as a default.

Skip section headers, instructions to candidates, and anything that isn't itself a question to answer. Return ONLY the JSON array.`;

        const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 8000,
            messages: [
              {
                role: "user",
                content: [
                  { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
                  { type: "text", text: instructions },
                ],
              },
            ],
          }),
        });

        if (!anthropicRes.ok) {
          const errText = await anthropicRes.text().catch(() => "");
          console.error("[ai-assignment-extract] Anthropic API error:", anthropicRes.status, errText);
          return jsonResponse(
            { error: `AI extraction failed (${anthropicRes.status}). Please try again, or add the questions manually.` },
            502,
          );
        }

        const data: any = await anthropicRes.json();
        const textBlock = (data.content ?? []).find((b: any) => b.type === "text")?.text ?? "";

        let parsed: any;
        try {
          parsed = extractJsonArray(textBlock);
        } catch (e: any) {
          console.error("[ai-assignment-extract] JSON parse failed:", e?.message, textBlock.slice(0, 500));
          return jsonResponse(
            { error: "The AI couldn't return readable questions from this file. Try a clearer scan, or add questions manually." },
            502,
          );
        }

        if (!Array.isArray(parsed) || parsed.length === 0) {
          return jsonResponse(
            { error: "No questions were found in that document. Make sure it's the actual question paper, then try again." },
            422,
          );
        }

        const questions: ExtractedQuestion[] = parsed
          .filter((q: any) => q && typeof q.text === "string" && q.text.trim())
          .map((q: any) => {
            const type: ExtractedQuestion["type"] = q.type === "mcq" || q.type === "diagram" ? q.type : "text";
            const marks = Number(q.max_marks);
            return {
              id: crypto.randomUUID(),
              type,
              text: String(q.text).trim(),
              ...(type === "mcq" && Array.isArray(q.options)
                ? { options: q.options.map((o: any) => String(o).trim()).filter(Boolean) }
                : {}),
              max_marks: Number.isFinite(marks) && marks > 0 ? marks : 5,
            };
          });

        if (questions.length === 0) {
          return jsonResponse(
            { error: "No questions were found in that document. Make sure it's the actual question paper, then try again." },
            422,
          );
        }

        return jsonResponse({ questions });
      },
    },
  },
});
