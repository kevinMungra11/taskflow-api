import { notFound } from '../../utils/errors.js';
import { toLimitOffset, toPage, type Page } from '../../utils/pagination.js';
import { assertProjectMember } from '../projects/projects.service.js';
import { tasksRepository } from './tasks.repository.js';
import type { CreateTaskInput, ListTasksQuery, TaskPriority, TaskStatus, UpdateTaskInput } from './tasks.schemas.js';

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export async function createTask(projectId: string, userId: string, input: CreateTaskInput): Promise<Task> {
  await assertProjectMember(projectId, userId);
  return tasksRepository.insert(projectId, userId, input);
}

export async function listTasks(projectId: string, userId: string, query: ListTasksQuery): Promise<Page<Task>> {
  await assertProjectMember(projectId, userId);

  const { page, pageSize, ...filters } = query;
  const [items, total] = await Promise.all([
    tasksRepository.findByProject(projectId, filters, toLimitOffset({ page, pageSize })),
    tasksRepository.countByProject(projectId, filters),
  ]);
  return toPage(items, total, { page, pageSize });
}

export async function getTask(taskId: string, userId: string): Promise<Task> {
  const task = await tasksRepository.findById(taskId);
  if (!task) throw notFound('Task not found');

  try {
    await assertProjectMember(task.project_id, userId);
  } catch {
    // Same response as a missing task so ids from other projects can't be probed.
    throw notFound('Task not found');
  }
  return task;
}

export async function updateTask(taskId: string, userId: string, input: UpdateTaskInput): Promise<Task> {
  await getTask(taskId, userId);

  const task = await tasksRepository.update(taskId, input);
  if (!task) throw notFound('Task not found');
  return task;
}

export async function deleteTask(taskId: string, userId: string): Promise<void> {
  await getTask(taskId, userId);
  await tasksRepository.softDelete(taskId);
}
