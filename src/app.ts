import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { projectsRouter } from './modules/projects/projects.routes.js';
import { projectTasksRouter, tasksRouter } from './modules/tasks/tasks.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/auth', authRouter);
  app.use('/users', usersRouter);
  app.use('/projects', projectsRouter);
  app.use('/projects/:projectId/tasks', projectTasksRouter);
  app.use('/tasks', tasksRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
