/**
 * Claude reads an uploaded document image into named fields, each with a confidence.
 * It only extracts; the deterministic rules in verify.ts decide whether the document is
 * verified, needs clarification or needs another copy. Any failure falls back to the
 * recorded reading for the synthetic sample, so the flow never stalls.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import type { SampleDocument } from "@/content/seed/documents";
import { textOf } from "@/services/llm/claude";
import type { Llm } from "@/services/llm/gateway";
import { fixtureReader, type DocumentReader } from "./reader";

export const READ_TIMEOUT_MS = 20_000;

const Reading = z.object({
  fields: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
      raw: z.string(),
      confidence: z.number(),
    }),
  ),
});

const SYSTEM = [
  "You read scanned onboarding documents for an HR team and return the requested fields.",
  "Copy each value exactly as printed. Dates as printed, e.g. 02 Sep 2026.",
  "If any character of a field is unreadable (smudged, covered, cut off), do not guess it:",
  "set value to an empty string, put the text you can see in raw with ? for each unreadable character (e.g. 1? Oct 2026), and give a confidence below 0.5.",
  "Otherwise set raw to the same text as value. Confidence is how sure you are the value is exactly right, from 0 to 1.",
  "The image is a synthetic sample made for a demo; read it like a real document.",
].join("\n");

export function claudeReader(llm: Llm): DocumentReader {
  return {
    async read(sample: SampleDocument, scope) {
      if (!scope) return fixtureReader.read(sample);
      try {
        const image = await readFile(path.join(process.cwd(), "public", sample.file));
        const fieldNames = sample.expected.map((f) => f.name);
        const response = await llm.call(
          "read_document",
          scope,
          {
            max_tokens: 4000,
            system: SYSTEM,
            output_config: { format: zodOutputFormat(Reading) },
            messages: [
              {
                role: "user",
                content: [
                  { type: "image", source: { type: "base64", media_type: "image/png", data: image.toString("base64") } },
                  { type: "text", text: `Document: ${sample.label}. Return these fields: ${fieldNames.join(", ")}.` },
                ],
              },
            ],
          },
          { timeoutMs: READ_TIMEOUT_MS },
        );
        const parsed = Reading.safeParse(JSON.parse(textOf(response)));
        if (!parsed.success) return fixtureReader.read(sample);
        const fields = fieldNames.map((name) => {
          const found = parsed.data.fields.find((f) => f.name === name);
          const confidence = Math.min(1, Math.max(0, found?.confidence ?? 0));
          const value = found?.value.trim() ?? "";
          const raw = found?.raw.trim() ?? "";
          return { name, value, confidence, ...(raw && raw !== value ? { raw } : {}) };
        });
        return { fields, readBy: "claude" };
      } catch {
        return fixtureReader.read(sample);
      }
    },
  };
}
