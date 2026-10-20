import { query } from '../../db/pool.js';
import { notFound } from '../../utils/errors.js';
import { toLimitOffset, toPage, type Page } from '../../utils/pagination.js';
import { recordActivity } from '../activity/activity.service.js';
import { assertProjectMember } from '../projects/projects.service.js';
import type { CreateTaskInput, ListTasksQuery, TaskPriority, TaskStatus, UpdateTaskInput } from './tasks.schemas.js';

export interface Task {
  id: string;
  project_id: string;
  number: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

const TASK_COLUMNS =
  'id, project_id, number, title, description, status, priority, due_date, created_by, created_at, updated_at';

const UPDATABLE_FIELDS = ['title', 'description', 'status', 'priority', 'due_date'] as const;

export async function createTask(projectId: string, userId: string, input: CreateTaskInput): Promise<Task> {
  await assertProjectMember(projectId, userId);

  const next = await query<{ number: number }>(
    'SELECT COALESCE(MAX(number), 0) + 1 AS number FROM tasks WHERE project_id = $1',
    [projectId],
  );

  const { rows } = await query<Task>(
    `INSERT INTO tasks (project_id, number, title, description, status, priority, due_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${TASK_COLUMNS}`,
    [
      projectId,
      next.rows[0]!.number,
      input.title,
      input.description ?? null,
      input.status,
      input.priority,
      input.due_date ?? null,
      userId,
    ],
  );
  const task = rows[0]!;

  await recordActivity({ projectId, actorId: userId, type: 'task_created', taskId: task.id, payload: { title: task.title } });
  return task;
}

export async function listTasks(projectId: string, userId: string, filters: ListTasksQuery): Promise<Page<Task>> {
  await assertProjectMember(projectId, userId);

  const conditions = ['project_id = $1', 'deleted_at IS NULL'];
  const params: unknown[] = [projectId];
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filters.priority) {
    params.push(filters.priority);
    conditions.push(`priority = $${params.length}`);
  }
  const where = conditions.join(' AND ');
  const { limit, offset } = toLimitOffset(filters);

  const [list, count] = await Promise.all([
    query<Task>(
      `SELECT ${TASK_COLUMNS} FROM tasks
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    query<{ total: string }>(`SELECT count(*) AS total FROM tasks WHERE ${where}`, params),
  ]);

  return toPage(list.rows, Number(count.rows[0]?.total ?? 0), filters);
}

export async function getTask(taskId: string, userId: string): Promise<Task> {
  const { rows } = await query<Task>(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $1 AND deleted_at IS NULL`, [
    taskId,
  ]);
  const task = rows[0];
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

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const field of UPDATABLE_FIELDS) {
    if (input[field] !== undefined) {
      params.push(input[field]);
      sets.push(`${field} = $${params.length}`);
    }
  }
  params.push(taskId);

  const { rows } = await query<Task>(
    `UPDATE tasks SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $${params.length} AND deleted_at IS NULL
     RETURNING ${TASK_COLUMNS}`,
    params,
  );
  const task = rows[0];
  if (!task) throw notFound('Task not found');

  await recordActivity({
    projectId: task.project_id,
    actorId: userId,
    type: 'task_updated',
    taskId: task.id,
    payload: { changes: input },
  });
  return task;
}

export async function deleteTask(taskId: string, userId: string): Promise<void> {
  const task = await getTask(taskId, userId);
  await query('UPDATE tasks SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [taskId]);
  await recordActivity({ projectId: task.project_id, actorId: userId, type: 'task_deleted', taskId });
}
