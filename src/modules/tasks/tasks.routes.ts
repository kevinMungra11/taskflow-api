import { Router } from 'express';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { createTaskSchema, listTasksQuerySchema, updateTaskSchema } from './tasks.schemas.js';
import * as tasksService from './tasks.service.js';

/** Routes nested under /projects/:projectId/tasks */
export const projectTasksRouter = Router({ mergeParams: true });
projectTasksRouter.use(requireAuth);

projectTasksRouter.post('/', async (req, res) => {
  const { projectId } = req.params as { projectId: string };
  const input = createTaskSchema.parse(req.body);
  const task = await tasksService.createTask(projectId, currentUser(req).id, input);
  res.status(201).json({ task });
});

projectTasksRouter.get('/', async (req, res) => {
  const { projectId } = req.params as { projectId: string };
  const filters = listTasksQuerySchema.parse(req.query);
  res.json(await tasksService.listTasks(projectId, currentUser(req).id, filters));
});

/** Routes under /tasks/:taskId */
export const tasksRouter = Router();
tasksRouter.use(requireAuth);

tasksRouter.get('/:taskId', async (req, res) => {
  const task = await tasksService.getTask(req.params.taskId, currentUser(req).id);
  res.json({ task });
});

tasksRouter.patch('/:taskId', async (req, res) => {
  const input = updateTaskSchema.parse(req.body);
  const task = await tasksService.updateTask(req.params.taskId, currentUser(req).id, input);
  res.json({ task });
});

tasksRouter.delete('/:taskId', async (req, res) => {
  await tasksService.deleteTask(req.params.taskId, currentUser(req).id);
  res.status(204).end();
});
