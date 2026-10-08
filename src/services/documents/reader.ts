import type { SampleDocument } from "@/content/seed/documents";
import type { ExtractedField } from "@/lib/db/schema";

export interface ReadResult {
  fields: ExtractedField[];
  readBy: "claude" | "fixture";
}

/** Reads a document image into structured fields with a confidence per field. */
export interface DocumentReader {
  read(sample: SampleDocument): Promise<ReadResult>;
}

/** Offline reader: returns the reading recorded for each synthetic sample. */
export const fixtureReader: DocumentReader = {
  async read(sample) {
    return { fields: sample.expected.map((f) => ({ ...f })), readBy: "fixture" };
  },
};
