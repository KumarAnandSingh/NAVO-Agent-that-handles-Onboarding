import { beforeAll, describe, expect, it } from "vitest";
import { createMemoryDb, type Db } from "@/lib/db/client";
import {
  ActionError,
  confirmDocumentField,
  confirmPickup,
  recordPulse,
  setEmergencyContact,
  submitForms,
  uploadSampleDocument,
} from "@/services/employee-actions";
import { createWorkspace } from "@/services/workspace";
import { ANAND, completeDocumentsChapter, deps } from "./helpers";

let db: Db;
let ws: string;

beforeAll(async () => {
  db = await createMemoryDb();
  ws = (await createWorkspace(db, "hr_responds")).id;
});

describe("joiner actions reject what can't be done, with a message the app can show", () => {
  it("refuses unknown documents and missing details", async () => {
    await expect(uploadSampleDocument(db, ws, ANAND, "passport-scan", deps)).rejects.toThrow("Unknown sample document passport-scan");
    await expect(confirmDocumentField(db, ws, ANAND, "visa", "2026-10-16", deps)).rejects.toThrow("Document not found");
    await expect(setEmergencyContact(db, ws, ANAND, "Ka")).rejects.toThrow("Add a name and phone number");
    await expect(submitForms(db, ws, ANAND, deps)).rejects.toThrow(/^Still needed: /);
    await expect(confirmPickup(db, ws, ANAND, [], deps)).rejects.toBeInstanceOf(ActionError);
    await expect(recordPulse(db, ws, ANAND, 7)).rejects.toThrow("Score must be 1 to 5");
    await expect(recordPulse(db, ws, ANAND, 2.5)).rejects.toThrow("Score must be 1 to 5");
  });

  it("won't complete a task that is still blocked", async () => {
    await expect(confirmPickup(db, ws, ANAND, ["id"], deps)).rejects.toThrow("isn't ready yet");
  });

  it("treats a repeated confirmation as a no-op", async () => {
    await completeDocumentsChapter(db, ws);
    // The relieving date is already confirmed: confirming it again changes nothing.
    await expect(confirmDocumentField(db, ws, ANAND, "relieving_letter", "2026-10-16", deps)).resolves.toBeUndefined();
    await expect(submitForms(db, ws, ANAND, deps)).resolves.toBeUndefined();
  });
});
