import { query } from '../../db/pool.js';
import { notFound } from '../../utils/errors.js';
import { toLimitOffset, toPage, type Page, type Pagination } from '../../utils/pagination.js';
import { createNotification } from '../notifications/notifications.service.js';
import { assertProjectMember, isProjectMember } from '../projects/projects.service.js';
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
  assignee_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const TASK_COLUMNS =
  'id, project_id, title, description, status, priority, due_date, created_by, assignee_id, created_at, updated_at';

export interface AssignedTask extends Task {
  project_name: string;
}

const UPDATABLE_FIELDS = ['title', 'description', 'status', 'priority', 'due_date'] as const;

export async function createTask(projectId: string, userId: string, input: CreateTaskInput): Promise<Task> {
  await assertProjectMember(projectId, userId);

  const { rows } = await query<Task>(
    `INSERT INTO tasks (project_id, title, description, status, priority, due_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${TASK_COLUMNS}`,
    [projectId, input.title, input.description ?? null, input.status, input.priority, input.due_date ?? null, userId],
  );
  return rows[0]!;
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
  return task;
}

export async function deleteTask(taskId: string, userId: string): Promise<void> {
  await getTask(taskId, userId);
  await query('UPDATE tasks SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [taskId]);
}

export async function assignTask(taskId: string, actorId: string, assigneeId: string | null): Promise<Task> {
  const task = await getTask(taskId, actorId);

  if (assigneeId && !(await isProjectMember(task.project_id, assigneeId))) {
    throw notFound('Assignee is not a member of this project');
  }

  const { rows } = await query<Task>(
    `UPDATE tasks SET assignee_id = $1, updated_at = now()
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING ${TASK_COLUMNS}`,
    [assigneeId, taskId],
  );
  const updated = rows[0];
  if (!updated) throw notFound('Task not found');

  if (assigneeId && assigneeId !== actorId && assigneeId !== task.assignee_id) {
    createNotification(assigneeId, 'task_assigned', {
      taskId: updated.id,
      taskTitle: updated.title,
      projectId: updated.project_id,
      assignedBy: actorId,
    }).catch((err) => {
      console.error('Failed to create task_assigned notification', err);
    });
  }

  return updated;
}

export async function listAssignedTasks(userId: string, pagination: Pagination): Promise<Page<AssignedTask>> {
  const { limit, offset } = toLimitOffset(pagination);

  const [list, count] = await Promise.all([
    query<Task>(
      `SELECT ${TASK_COLUMNS} FROM tasks
       WHERE assignee_id = $1 AND deleted_at IS NULL
       ORDER BY due_date ASC NULLS LAST, created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    ),
    query<{ total: string }>('SELECT count(*) AS total FROM tasks WHERE assignee_id = $1 AND deleted_at IS NULL', [
      userId,
    ]),
  ]);

  const items: AssignedTask[] = [];
  for (const task of list.rows) {
    const { rows } = await query<{ name: string }>('SELECT name FROM projects WHERE id = $1', [task.project_id]);
    items.push({ ...task, project_name: rows[0]?.name ?? '' });
  }

  return toPage(items, Number(count.rows[0]?.total ?? 0), pagination);
}
