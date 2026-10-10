import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ActionError } from "@/services/employee-actions";
import { ConflictError, NotFoundError } from "@/services/onboarding-state/repository";
import { loadState } from "@/services/view-model/load";
import { present } from "@/services/view-model/present";
import type { ViewModel } from "@/services/view-model/types";
import type { Db } from "@/lib/db/client";
import type { AiAccess } from "@/services/llm/gateway";
import { aiStatus } from "@/services/llm/usage";
import { byokEnabled } from "./deps";

export async function buildViewModel(db: Db, workspaceId: string, access: AiAccess): Promise<ViewModel> {
  const state = await loadState(db, workspaceId);
  return present(state, { ai: await aiStatus(db, workspaceId, access, byokEnabled()) });
}

/** Map domain errors to HTTP responses with a message safe to show in the UI. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid request", issues: error.issues }, { status: 400 });
  if (error instanceof ActionError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
  if (error instanceof ConflictError) return NextResponse.json({ error: "Someone else changed this. Refresh and try again." }, { status: 409 });
  console.error(error);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
