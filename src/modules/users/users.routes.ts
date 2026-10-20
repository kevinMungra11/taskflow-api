import { Router } from 'express';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { getUserById } from './users.service.js';

export const usersRouter = Router();

usersRouter.get('/me', requireAuth, async (req, res) => {
  const user = await getUserById(currentUser(req).id);
  res.json({ user });
});
