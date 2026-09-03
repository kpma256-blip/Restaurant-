import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { USER_ROLES } from "../lib/constants";

export const usersRouter = Router();

usersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.user.findMany({ orderBy: { name: "asc" } }));
  })
);

// NOTE: there is no login/password here — see currentUser.ts middleware.
// This is user *directory* management (who shows up in "Acting as" and
// gets attributed on ledger entries), not authentication. Real auth with
// sign-in is a documented future item (README "What's next").
const upsertSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(USER_ROLES).default("STAFF"),
});

usersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = upsertSchema.parse(req.body);
    const user = await prisma.user.create({ data });
    res.status(201).json(user);
  })
);

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(USER_ROLES).optional(),
});

usersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    res.json(user);
  })
);

usersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
