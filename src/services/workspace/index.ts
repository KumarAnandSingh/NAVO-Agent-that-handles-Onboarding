import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { POLICIES } from "@/content/policies";
import { SEED_VERSION } from "@/content/company";
import type { ScenarioId } from "@/domain/types";
import type { Db, Queryable } from "@/lib/db/client";
import { policyDocuments, policySections, workspaces } from "@/lib/db/schema";
import { seedWorkspace } from "./seed";

export type Workspace = typeof workspaces.$inferSelect;

const WORKSPACE_TTL_MS = 48 * 3_600_000;

/** Load the global policy library. Idempotent: existing versions are left untouched. */
export async function ensurePolicies(db: Queryable): Promise<void> {
  for (const policy of POLICIES) {
    await db
      .insert(policyDocuments)
      .values({
        id: policy.id,
        version: policy.version,
        title: policy.title,
        category: policy.category,
        effectiveDate: policy.effectiveDate,
        supersededBy: policy.supersededBy ?? null,
      })
      .onConflictDoNothing();
    await db
      .insert(policySections)
      .values(
        policy.sections.map((section) => ({
          id: `${policy.id}@${policy.version}${section.ref}`,
          documentId: policy.id,
          version: policy.version,
          ref: section.ref,
          title: section.title,
          body: section.body,
        })),
      )
      .onConflictDoNothing();
  }
}

export async function createWorkspace(db: Db, scenario: ScenarioId = "hr_responds"): Promise<Workspace> {
  const id = `ws_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  await ensurePolicies(db);
  await db.transaction(async (tx) => {
    await seedWorkspace(tx, { workspaceId: id, scenario });
  });
  // Housekeeping: drop demo workspaces nobody has touched for two days.
  await db.delete(workspaces).where(lt(workspaces.createdAt, new Date(Date.now() - WORKSPACE_TTL_MS)));
  return requireWorkspace(db, id);
}

/** Rebuild a workspace from seed, keeping its id so the visitor's cookie stays valid. */
export async function resetWorkspace(db: Db, id: string, scenario: ScenarioId): Promise<Workspace> {
  await ensurePolicies(db);
  await db.transaction(async (tx) => {
    await tx.delete(workspaces).where(eq(workspaces.id, id));
    await seedWorkspace(tx, { workspaceId: id, scenario });
  });
  return requireWorkspace(db, id);
}

export async function findWorkspace(db: Queryable, id: string): Promise<Workspace | null> {
  const [row] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, id), eq(workspaces.seedVersion, SEED_VERSION)));
  return row ?? null;
}

export async function requireWorkspace(db: Queryable, id: string): Promise<Workspace> {
  const workspace = await findWorkspace(db, id);
  if (!workspace) throw new Error(`Workspace ${id} not found`);
  return workspace;
}
