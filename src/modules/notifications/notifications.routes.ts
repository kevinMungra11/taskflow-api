import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { paginationSchema } from '../../utils/pagination.js';
import * as notificationsService from './notifications.service.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

const listQuerySchema = paginationSchema.extend({
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

notificationsRouter.get('/', async (req, res) => {
  const { unread, ...pagination } = listQuerySchema.parse(req.query);
  res.json(await notificationsService.listNotifications(currentUser(req).id, { ...pagination, unreadOnly: unread }));
});

notificationsRouter.post('/:notificationId/read', async (req, res) => {
  const notification = await notificationsService.markAsRead(req.params.notificationId);
  res.json({ notification });
});
