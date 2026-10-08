/** Mock background-verification vendor and facilities desk. */
import { and, eq } from "drizzle-orm";
import type { Queryable } from "@/lib/db/client";
import { facilitiesItems, vendorChecks } from "@/lib/db/schema";

export async function clearCheck(db: Queryable, workspaceId: string, checkId: string, at: Date): Promise<boolean> {
  const [row] = await db
    .update(vendorChecks)
    .set({ status: "cleared", completedAt: at })
    .where(and(eq(vendorChecks.workspaceId, workspaceId), eq(vendorChecks.id, checkId), eq(vendorChecks.status, "in_progress")))
    .returning();
  return Boolean(row);
}

export async function markItemReady(db: Queryable, workspaceId: string, itemId: string, at: Date): Promise<boolean> {
  const [row] = await db
    .update(facilitiesItems)
    .set({ status: "ready", readyAt: at })
    .where(and(eq(facilitiesItems.workspaceId, workspaceId), eq(facilitiesItems.id, itemId), eq(facilitiesItems.status, "preparing")))
    .returning();
  return Boolean(row);
}

export async function markItemsCollected(db: Queryable, workspaceId: string, employeeId: string): Promise<void> {
  await db
    .update(facilitiesItems)
    .set({ status: "collected" })
    .where(and(eq(facilitiesItems.workspaceId, workspaceId), eq(facilitiesItems.employeeId, employeeId)));
}
