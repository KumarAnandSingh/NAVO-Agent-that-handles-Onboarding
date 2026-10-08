import { NextResponse } from "next/server";
import { z } from "zod";
import { FEATURED_EMPLOYEE_ID } from "@/content/company";
import { hrGenerateEmployeeId } from "@/services/employee-actions";
import { agentDeps } from "@/server/deps";
import { buildViewModel, errorResponse } from "@/server/respond";
import { currentWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";

const body = z.discriminatedUnion("action", [z.object({ action: z.literal("generate_id") })]);

export async function POST(request: Request) {
  try {
    body.parse(await request.json());
    const { db, workspace } = await currentWorkspace();
    await hrGenerateEmployeeId(db, workspace.id, FEATURED_EMPLOYEE_ID, agentDeps());
    return NextResponse.json({ vm: await buildViewModel(db, workspace.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
