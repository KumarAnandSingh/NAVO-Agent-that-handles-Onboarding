import { cookies } from "next/headers";
import { getDb, type Db } from "@/lib/db/client";
import { createWorkspace, findWorkspace, type Workspace } from "@/services/workspace";

export const WORKSPACE_COOKIE = "navo_ws";

/**
 * The visitor's demo workspace. Every browser gets its own seeded copy of the Halden
 * dataset, identified by an httpOnly cookie, so judges exploring at the same time never
 * see each other's changes.
 */
export async function currentWorkspace(): Promise<{ db: Db; workspace: Workspace }> {
  const db = await getDb();
  const store = await cookies();
  const id = store.get(WORKSPACE_COOKIE)?.value;
  const existing = id ? await findWorkspace(db, id) : null;
  if (existing) return { db, workspace: existing };
  const workspace = await createWorkspace(db, "hr_responds");
  store.set(WORKSPACE_COOKIE, workspace.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 48,
  });
  return { db, workspace };
}
