import { NextResponse } from "next/server";
import { buildViewModel, errorResponse } from "@/server/respond";
import { currentWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db, workspace } = await currentWorkspace();
    return NextResponse.json({ vm: await buildViewModel(db, workspace.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
