import { Router } from 'express';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { paginationSchema } from '../../utils/pagination.js';
import { listAssignedTasks } from '../tasks/tasks.service.js';
import { getUserById } from './users.service.js';

export const usersRouter = Router();

usersRouter.get('/me', requireAuth, async (req, res) => {
  const user = await getUserById(currentUser(req).id);
  res.json({ user });
});

usersRouter.get('/me/tasks', requireAuth, async (req, res) => {
  const pagination = paginationSchema.parse(req.query);
  res.json(await listAssignedTasks(currentUser(req).id, pagination));
});
