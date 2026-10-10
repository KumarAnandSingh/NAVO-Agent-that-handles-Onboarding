import { NextResponse } from "next/server";
import { z } from "zod";
import { FEATURED_EMPLOYEE_ID } from "@/content/company";
import { hrGenerateEmployeeId } from "@/services/employee-actions";
import { PolicyUploadInput, previewPolicy, publishPolicy } from "@/services/policy-retrieval/upload";
import { agentDeps, aiAccess } from "@/server/deps";
import { buildViewModel, errorResponse } from "@/server/respond";
import { currentWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate_id") }),
  z.object({ action: z.literal("preview_policy"), policy: PolicyUploadInput }),
  z.object({ action: z.literal("publish_policy"), policy: PolicyUploadInput }),
]);

export async function POST(request: Request) {
  try {
    const input = body.parse(await request.json());
    const { db, workspace } = await currentWorkspace();
    const access = aiAccess(request);
    switch (input.action) {
      case "generate_id":
        await hrGenerateEmployeeId(db, workspace.id, FEATURED_EMPLOYEE_ID, agentDeps(access));
        return NextResponse.json({ vm: await buildViewModel(db, workspace.id, access) });
      case "preview_policy":
        return NextResponse.json({ preview: await previewPolicy(db, workspace.id, workspace.simNow, input.policy) });
      case "publish_policy": {
        const published = await publishPolicy(db, workspace.id, workspace.simNow, input.policy);
        return NextResponse.json({ published, vm: await buildViewModel(db, workspace.id, access) });
      }
    }
  } catch (error) {
    return errorResponse(error);
  }
}
