import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { prescriptions } from "../db/schema";
import { requireAuth } from "../auth/middleware";
import { buildTrainingPlan } from "../prescription/prescriptionEngine";
import type { TrainingPlanResponse } from "@shared/api";

export const prescriptionRouter = Router();

prescriptionRouter.get("/", requireAuth, (req, res) => {
  const userId = req.user!.id;

  const stored = db
    .select()
    .from(prescriptions)
    .where(and(eq(prescriptions.userId, userId), eq(prescriptions.status, "active")))
    .orderBy(desc(prescriptions.createdAt))
    .limit(1)
    .all()[0];

  const plan: TrainingPlanResponse = stored ? JSON.parse(stored.planJson) : buildTrainingPlan(userId);

  res.json(plan);
});
