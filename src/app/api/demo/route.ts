import { NextResponse } from "next/server";
import { z } from "zod";
import { advanceStory, injectItDelay, jumpToChapter, jumpToDay30, reset, setScenario, skipAhead } from "@/services/demo-director";
import { agentDeps, aiAccess } from "@/server/deps";
import { buildViewModel, errorResponse } from "@/server/respond";
import { currentWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";
// A cold serverless instance without DATABASE_URL boots embedded Postgres first, which can outlast the 10 s default.
export const maxDuration = 60;

const scenario = z.enum(["hr_responds", "hr_silent"]);
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("advance") }),
  z.object({ action: z.literal("reset"), scenario: scenario.optional() }),
  z.object({ action: z.literal("scenario"), scenario }),
  z.object({ action: z.literal("it_delay") }),
  z.object({ action: z.literal("chapter"), chapter: z.number().int().min(0).max(5) }),
  z.object({ action: z.literal("day30") }),
  z.object({ action: z.literal("skip"), to: z.enum(["risk_day", "day1", "pickup", "day1_end", "week1"]) }),
]);

export async function POST(request: Request) {
  try {
    const input = body.parse(await request.json());
    const { db, workspace } = await currentWorkspace();
    const access = aiAccess(request);
    let processed: { type: string; label: string; outcome: string }[] = [];
    switch (input.action) {
      case "advance": {
        const result = await advanceStory(db, workspace.id, agentDeps(access));
        processed = result.map((p) => ({ type: p.type, label: p.label, outcome: p.outcome }));
        break;
      }
      case "reset":
        await reset(db, workspace.id, input.scenario);
        break;
      case "scenario":
        await setScenario(db, workspace.id, input.scenario);
        break;
      case "it_delay":
        await injectItDelay(db, workspace.id, agentDeps(access));
        break;
      case "chapter":
        await jumpToChapter(db, workspace.id, input.chapter);
        break;
      case "day30":
        await jumpToDay30(db, workspace.id);
        break;
      case "skip":
        await skipAhead(db, workspace.id, input.to);
        break;
    }
    return NextResponse.json({ vm: await buildViewModel(db, workspace.id, access), processed });
  } catch (error) {
    return errorResponse(error);
  }
}
