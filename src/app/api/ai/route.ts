import { NextResponse } from "next/server";
import { byokEnabled, visitorKey } from "@/server/deps";
import { checkKey } from "@/services/llm/key-check";

export const dynamic = "force-dynamic";

/** Test a visitor's own Claude key (sent in the key header, never in the body, never logged). */
export async function POST(request: Request) {
  if (!byokEnabled()) return NextResponse.json({ ok: false, error: "This deployment doesn't accept visitor keys." }, { status: 403 });
  const key = visitorKey(request);
  if (!key) return NextResponse.json({ ok: false, error: "That doesn't look like an Anthropic API key. It starts with sk-ant-." }, { status: 400 });
  const result = await checkKey(key);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
