import { NextResponse } from "next/server";
import { aiAccess } from "@/server/deps";
import { buildViewModel, errorResponse } from "@/server/respond";
import { currentWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { db, workspace } = await currentWorkspace();
    return NextResponse.json({ vm: await buildViewModel(db, workspace.id, aiAccess(request)) });
  } catch (error) {
    return errorResponse(error);
  }
}
