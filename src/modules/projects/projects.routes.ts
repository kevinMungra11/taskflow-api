import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { paginationSchema } from '../../utils/pagination.js';
import { listActivity } from '../activity/activity.service.js';
import * as projectsService from './projects.service.js';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
});

const addMemberSchema = z.object({
  email: z.string().trim().email(),
});

projectsRouter.post('/', async (req, res) => {
  const input = createProjectSchema.parse(req.body);
  const project = await projectsService.createProject(currentUser(req).id, input);
  res.status(201).json({ project });
});

projectsRouter.get('/', async (req, res) => {
  const pagination = paginationSchema.parse(req.query);
  res.json(await projectsService.listProjectsForUser(currentUser(req).id, pagination));
});

projectsRouter.get('/:projectId', async (req, res) => {
  const project = await projectsService.getProject(req.params.projectId, currentUser(req).id);
  res.json({ project });
});

projectsRouter.get('/:projectId/stats', async (req, res) => {
  const stats = await projectsService.getProjectStats(req.params.projectId, currentUser(req).id);
  res.json({ stats });
});

projectsRouter.get('/:projectId/activity', async (req, res) => {
  const pagination = paginationSchema.parse(req.query);
  res.json(await listActivity(req.params.projectId, currentUser(req).id, pagination));
});

projectsRouter.get('/:projectId/members', async (req, res) => {
  const members = await projectsService.listMembers(req.params.projectId, currentUser(req).id);
  res.json({ members });
});

projectsRouter.post('/:projectId/members', async (req, res) => {
  const { email } = addMemberSchema.parse(req.body);
  const member = await projectsService.addMember(req.params.projectId, currentUser(req).id, email);
  res.status(201).json({ member });
});

projectsRouter.delete('/:projectId/members/:userId', async (req, res) => {
  await projectsService.removeMember(req.params.projectId, currentUser(req).id, req.params.userId);
  res.status(204).end();
});
