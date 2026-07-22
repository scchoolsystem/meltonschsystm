// src/routes/api/ai-assignment-extract.ts
//
// Teacher uploads a PDF (question paper) when creating an assignment. This
// route pulls its text out locally (unpdf) and splits it into questions
// with regex/rule-based heuristics — no AI call, no API key, no cost.
//
// Trade-off vs the old Anthropic-based version: this needs a real text
// layer in the PDF and fairly standard numbering ("1.", "Q2:", etc). It
// can't read scanned/photographed papers (no OCR) and won't handle
// multi-column layouts or genuine diagrams as well as a vision model would.
// The frontend already treats this as a first-pass draft the teacher
// reviews/edits before publishing, so a rougher first pass is an acceptable
// trade for zero ongoing cost.

import { createFileRoute } from "@tanstack/react-router";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractTextFromPdf, parseQuestionsFromText } from "@/lib/pdf-question-extractor";

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15MB raw file (base64 is ~33% bigger on the wire)

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/ai-assignment-extract")({
  server: {
    middleware: [requireSupabaseAuth],
    handlers: {
      POST: async ({ request }) => {
        let body: { pdfBase64?: string; fileName?: string };
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Bad JSON body" }, 400);
        }

        const { pdfBase64 } = body;
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

        let rawText: string;
        try {
          rawText = await extractTextFromPdf(pdfBase64);
        } catch (e: any) {
          console.error("[ai-assignment-extract] PDF text extraction failed:", e?.message);
          return jsonResponse(
            {
              error:
                "Couldn't read that PDF. It may be a scanned/photographed document without a text layer — try adding questions manually instead.",
            },
            422,
          );
        }

        if (!rawText.trim()) {
          return jsonResponse(
            {
              error:
                "No readable text was found in that PDF. It may be scanned or image-only — try adding questions manually instead.",
            },
            422,
          );
        }

        const questions = parseQuestionsFromText(rawText);

        if (questions.length === 0) {
          return jsonResponse(
            {
              error:
                "No questions were recognized in that document. Check that it uses numbered questions (\"1.\", \"2)\", etc), then try again — or add questions manually.",
            },
            422,
          );
        }

        return jsonResponse({ questions });
      },
    },
  },
});
