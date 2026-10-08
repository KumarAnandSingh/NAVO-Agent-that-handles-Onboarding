/** Mock learning platform. */
import { and, eq } from "drizzle-orm";
import type { Queryable } from "@/lib/db/client";
import { trainingEnrollments } from "@/lib/db/schema";

export type EnrollmentRow = typeof trainingEnrollments.$inferSelect;

export async function enrol(
  db: Queryable,
  workspaceId: string,
  input: { employeeId: string; course: string; minutes: number; dueAt: Date },
): Promise<EnrollmentRow> {
  const id = `${input.employeeId}/${input.course.toLowerCase().replaceAll(" ", "-")}`;
  const [row] = await db
    .insert(trainingEnrollments)
    .values({ workspaceId, id, employeeId: input.employeeId, course: input.course, minutes: input.minutes, status: "enrolled", dueAt: input.dueAt })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const [existing] = await db
    .select()
    .from(trainingEnrollments)
    .where(and(eq(trainingEnrollments.workspaceId, workspaceId), eq(trainingEnrollments.id, id)));
  if (!existing) throw new Error("Could not enrol");
  return existing;
}

export async function completeCourse(db: Queryable, workspaceId: string, employeeId: string, at: Date): Promise<EnrollmentRow | null> {
  const [row] = await db
    .update(trainingEnrollments)
    .set({ status: "completed", completedAt: at })
    .where(and(eq(trainingEnrollments.workspaceId, workspaceId), eq(trainingEnrollments.employeeId, employeeId)))
    .returning();
  return row ?? null;
}
