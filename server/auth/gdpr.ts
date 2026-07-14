import crypto from "node:crypto";
import { eq, inArray, or } from "drizzle-orm";
import { db, rawSqlite } from "../db/client";
import {
  analyses,
  auditLog,
  coachStudents,
  dossiers,
  drillAttempts,
  drills,
  evidence,
  games,
  moves,
  playerSnapshots,
  prescriptions,
  reviewQueue,
  sessions,
  skillScores,
  trainingPrograms,
  usageCounters,
  users,
} from "../db/schema";

function gameIdsForUser(userId: string): string[] {
  return db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.userId, userId))
    .all()
    .map((row) => row.id);
}

export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const userRow = db.select().from(users).where(eq(users.id, userId)).get();
  const gameIds = gameIdsForUser(userId);
  const userGames = db.select().from(games).where(eq(games.userId, userId)).all();
  const userMoves = gameIds.length > 0 ? db.select().from(moves).where(inArray(moves.gameId, gameIds)).all() : [];
  const userAnalyses = db.select().from(analyses).where(eq(analyses.userId, userId)).all();
  const userSkillScores = db.select().from(skillScores).where(eq(skillScores.userId, userId)).all();
  const userSnapshots = db.select().from(playerSnapshots).where(eq(playerSnapshots.userId, userId)).all();
  const userPrescriptions = db.select().from(prescriptions).where(eq(prescriptions.userId, userId)).all();
  const userDrills = db.select().from(drills).where(eq(drills.userId, userId)).all();
  const userDrillAttempts = db.select().from(drillAttempts).where(eq(drillAttempts.userId, userId)).all();
  const userReviewQueue = db.select().from(reviewQueue).where(eq(reviewQueue.userId, userId)).all();
  const userDossiers = db.select().from(dossiers).where(eq(dossiers.ownerUserId, userId)).all();
  const userPrograms = db.select().from(trainingPrograms).where(eq(trainingPrograms.userId, userId)).all();
  const userUsage = db.select().from(usageCounters).where(eq(usageCounters.subjectKey, userId)).all();
  // Evidence tied to user's moves and skill scores
  const userEvidence =
    gameIds.length > 0
      ? db
          .select()
          .from(evidence)
          .where(
            or(
              inArray(
                evidence.moveId,
                db.select({ id: moves.id }).from(moves).where(inArray(moves.gameId, gameIds)),
              ),
              inArray(
                evidence.skillScoreId,
                db.select({ id: skillScores.id }).from(skillScores).where(eq(skillScores.userId, userId)),
              ),
            ),
          )
          .all()
      : db
          .select()
          .from(evidence)
          .where(inArray(evidence.skillScoreId, db.select({ id: skillScores.id }).from(skillScores).where(eq(skillScores.userId, userId))))
          .all();
  // Coach relationships (both as coach and as student)
  const userCoachRelations = db
    .select()
    .from(coachStudents)
    .where(or(eq(coachStudents.coachId, userId), eq(coachStudents.studentId, userId)))
    .all();

  logAudit({ userId, actorId: userId, action: "gdpr_export", entity: "user", entityId: userId });

  return {
    exportedAt: Date.now(),
    user: userRow
      ? { ...userRow, passwordHash: undefined, passwordSalt: undefined, passwordIterations: undefined }
      : null,
    games: userGames,
    moves: userMoves,
    analyses: userAnalyses,
    skillScores: userSkillScores,
    playerSnapshots: userSnapshots,
    prescriptions: userPrescriptions,
    drills: userDrills,
    drillAttempts: userDrillAttempts,
    reviewQueue: userReviewQueue,
    dossiers: userDossiers,
    trainingPrograms: userPrograms,
    usageCounters: userUsage,
    evidence: userEvidence,
    coachStudents: userCoachRelations,
  };
}

/**
 * Erases all user data in one transaction, in FK-safe order (children before
 * parents: drill attempts/review queue before drills, evidence before moves
 * and skill scores, moves/analyses before games). The user row itself is
 * tombstoned — id retained for audit-trail integrity, every personal field
 * cleared. audit_log rows are retained per Art. 17(3)(b) (legal-compliance
 * record of the deletion itself).
 */
export async function deleteUserData(userId: string): Promise<void> {
  const erase = rawSqlite.transaction(() => {
    const gameIds = gameIdsForUser(userId);

    db.delete(drillAttempts).where(eq(drillAttempts.userId, userId)).run();
    db.delete(reviewQueue).where(eq(reviewQueue.userId, userId)).run();
    db.delete(drills).where(eq(drills.userId, userId)).run();
    db.delete(evidence)
      .where(
        gameIds.length > 0
          ? or(
              inArray(
                evidence.moveId,
                db.select({ id: moves.id }).from(moves).where(inArray(moves.gameId, gameIds)),
              ),
              inArray(
                evidence.skillScoreId,
                db.select({ id: skillScores.id }).from(skillScores).where(eq(skillScores.userId, userId)),
              ),
            )
          : inArray(
              evidence.skillScoreId,
              db.select({ id: skillScores.id }).from(skillScores).where(eq(skillScores.userId, userId)),
            ),
      )
      .run();
    if (gameIds.length > 0) {
      db.delete(moves).where(inArray(moves.gameId, gameIds)).run();
    }
    db.delete(analyses).where(eq(analyses.userId, userId)).run();
    db.delete(skillScores).where(eq(skillScores.userId, userId)).run();
    db.delete(playerSnapshots).where(eq(playerSnapshots.userId, userId)).run();
    db.delete(prescriptions).where(eq(prescriptions.userId, userId)).run();
    db.delete(dossiers).where(eq(dossiers.ownerUserId, userId)).run();
    db.delete(trainingPrograms).where(eq(trainingPrograms.userId, userId)).run();
    db.delete(coachStudents)
      .where(or(eq(coachStudents.coachId, userId), eq(coachStudents.studentId, userId)))
      .run();
    db.delete(usageCounters).where(eq(usageCounters.subjectKey, userId)).run();
    if (gameIds.length > 0) {
      db.delete(games).where(eq(games.userId, userId)).run();
    }
    db.delete(sessions).where(eq(sessions.userId, userId)).run();

    db.update(users)
      .set({
        deletedAt: Date.now(),
        email: `deleted-${userId}@masterchess.local`,
        displayName: "Deleted user",
        passwordHash: "",
        passwordSalt: "",
      })
      .where(eq(users.id, userId))
      .run();
  });

  erase();

  logAudit({ userId, actorId: userId, action: "gdpr_delete", entity: "user", entityId: userId });
}

export function logAudit(entry: {
  userId?: string | null;
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: unknown;
}): void {
  db.insert(auditLog)
    .values({
      id: crypto.randomUUID(),
      userId: entry.userId ?? null,
      actorId: entry.actorId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      detailJson: entry.detail ? JSON.stringify(entry.detail) : null,
      at: Date.now(),
    })
    .run();
}
