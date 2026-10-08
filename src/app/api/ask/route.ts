import { NextResponse } from "next/server";
import { z } from "zod";
import { askNavo } from "@/services/ask";
import { claudeCreate } from "@/services/llm/claude";
import { buildViewModel, errorResponse } from "@/server/respond";
import { currentWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";
// Claude may take a few tool rounds; the answer has its own deadline well inside this.
export const maxDuration = 60;

const body = z.object({ question: z.string().trim().min(1, "Type a question").max(500) });

export async function POST(request: Request) {
  try {
    const { question } = body.parse(await request.json());
    const { db, workspace } = await currentWorkspace();
    const answer = await askNavo(db, workspace.id, question, { create: claudeCreate() });
    return NextResponse.json({ answer, vm: await buildViewModel(db, workspace.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
