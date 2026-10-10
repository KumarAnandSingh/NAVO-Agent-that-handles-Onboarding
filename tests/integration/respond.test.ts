import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ActionError } from "@/services/employee-actions";
import { ConflictError, NotFoundError } from "@/services/onboarding-state/repository";
import { PolicyUploadError } from "@/services/policy-retrieval/upload";
import { errorResponse } from "@/server/respond";

async function respond(error: unknown) {
  const response = errorResponse(error);
  return { status: response.status, body: (await response.json()) as { error: string } };
}

describe("API error responses", () => {
  it("maps each domain error to a status and a message safe to show", async () => {
    const parsed = z.object({ question: z.string().min(1, "Type a question") }).safeParse({ question: "" });
    expect(await respond(parsed.error)).toMatchObject({ status: 400, body: { error: "Type a question" } });
    expect(await respond(new ActionError("Tap what you collected"))).toEqual({ status: 400, body: { error: "Tap what you collected" } });
    expect(await respond(new PolicyUploadError("The new version must be higher than 2.1."))).toEqual({ status: 400, body: { error: "The new version must be higher than 2.1." } });
    expect(await respond(new NotFoundError("Workspace not found"))).toMatchObject({ status: 404 });
    expect(await respond(new ConflictError("stale"))).toEqual({ status: 409, body: { error: "Someone else changed this. Refresh and try again." } });
  });

  it("hides unexpected errors behind a generic message and logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await respond(new Error("database password is hunter2"))).toEqual({ status: 500, body: { error: "Something went wrong" } });
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
