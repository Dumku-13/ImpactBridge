import { Router } from "express";
import * as notificationService from "../services/notificationService.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const notificationRouter: Router = Router();

/** Every route is scoped to the signed-in user's own notifications. */
notificationRouter.use(requireAuth);

/** GET /api/notifications — recent items plus the unread count. */
notificationRouter.get("/", async (req, res, next) => {
  try {
    res.json(await notificationService.listNotifications(req.user!.id));
  } catch (err) {
    next(err);
  }
});

/** POST /api/notifications/read-all */
notificationRouter.post("/read-all", async (req, res, next) => {
  try {
    res.json(await notificationService.markAllRead(req.user!.id));
  } catch (err) {
    next(err);
  }
});

/** POST /api/notifications/:id/read */
notificationRouter.post("/:id/read", async (req, res, next) => {
  try {
    res.json(
      await notificationService.markRead(req.user!.id, req.params.id),
    );
  } catch (err) {
    next(err);
  }
});
