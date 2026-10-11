import { NextResponse } from "next/server";
import { z } from "zod";
import { FEATURED_EMPLOYEE_ID } from "@/content/company";
import {
  bookWalkthrough,
  completeTraining,
  confirmDocumentField,
  confirmPickup,
  decideApproval,
  enrolBenefits,
  recordPulse,
  setEmergencyContact,
  submitForms,
  uploadSampleDocument,
} from "@/services/employee-actions";
import { agentDeps, aiAccess } from "@/server/deps";
import { buildViewModel, errorResponse } from "@/server/respond";
import { currentWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";
// A cold serverless instance without DATABASE_URL boots embedded Postgres first, which can outlast the 10 s default.
export const maxDuration = 60;

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("upload_sample"), sampleId: z.string().min(1) }),
  z.object({ action: z.literal("confirm_field"), documentType: z.string().min(1), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ action: z.literal("emergency_contact"), value: z.string().min(5).max(120) }),
  z.object({ action: z.literal("submit_forms") }),
  z.object({ action: z.literal("complete_training") }),
  z.object({ action: z.literal("decide_approval"), approvalId: z.string().min(1), decision: z.enum(["approved", "declined"]) }),
  z.object({ action: z.literal("confirm_pickup"), collected: z.array(z.enum(["id", "laptop", "kit"])).min(1) }),
  z.object({ action: z.literal("enrol_benefits") }),
  z.object({ action: z.literal("pulse"), score: z.number().int().min(1).max(5) }),
  z.object({ action: z.literal("book_walkthrough") }),
]);

export async function POST(request: Request) {
  try {
    const input = body.parse(await request.json());
    const { db, workspace } = await currentWorkspace();
    const access = aiAccess(request);
    const deps = agentDeps(access);
    const id = FEATURED_EMPLOYEE_ID;
    switch (input.action) {
      case "upload_sample":
        await uploadSampleDocument(db, workspace.id, id, input.sampleId, deps);
        break;
      case "confirm_field":
        await confirmDocumentField(db, workspace.id, id, input.documentType, input.value, deps);
        break;
      case "emergency_contact":
        await setEmergencyContact(db, workspace.id, id, input.value);
        break;
      case "submit_forms":
        await submitForms(db, workspace.id, id, deps);
        break;
      case "complete_training":
        await completeTraining(db, workspace.id, id, deps);
        break;
      case "decide_approval":
        await decideApproval(db, workspace.id, id, input.approvalId, input.decision, deps);
        break;
      case "confirm_pickup":
        await confirmPickup(db, workspace.id, id, input.collected, deps);
        break;
      case "enrol_benefits":
        await enrolBenefits(db, workspace.id, id, deps);
        break;
      case "pulse":
        await recordPulse(db, workspace.id, id, input.score);
        break;
      case "book_walkthrough":
        await bookWalkthrough(db, workspace.id, id, deps);
        break;
    }
    return NextResponse.json({ vm: await buildViewModel(db, workspace.id, access) });
  } catch (error) {
    return errorResponse(error);
  }
}
