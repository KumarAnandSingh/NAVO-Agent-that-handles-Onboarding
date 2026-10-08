import type { SampleDocument } from "@/content/seed/documents";
import type { Queryable } from "@/lib/db/client";
import type { ExtractedField } from "@/lib/db/schema";

export interface ReadResult {
  fields: ExtractedField[];
  readBy: "claude" | "fixture";
}

/** Lets a Claude reader charge its call to the workspace's budget. */
export interface ReadScope {
  db: Queryable;
  workspaceId: string;
}

/** Reads a document image into structured fields with a confidence per field. */
export interface DocumentReader {
  read(sample: SampleDocument, scope?: ReadScope): Promise<ReadResult>;
}

/** Offline reader: returns the reading recorded for each synthetic sample. */
export const fixtureReader: DocumentReader = {
  async read(sample) {
    return { fields: sample.expected.map((f) => ({ ...f })), readBy: "fixture" };
  },
};
