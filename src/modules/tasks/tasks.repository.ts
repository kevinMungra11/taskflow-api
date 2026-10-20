import { query } from '../../db/pool.js';
import type { Task } from './tasks.service.js';
import type { CreateTaskInput, TaskPriority, TaskStatus, UpdateTaskInput } from './tasks.schemas.js';

const TASK_COLUMNS =
  'id, project_id, title, description, status, priority, due_date, created_by, created_at, updated_at';

export interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
}

function buildWhere(projectId: string, filters: TaskFilters) {
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
  return { where: conditions.join(' AND '), params };
}

export const tasksRepository = {
  async findById(id: string): Promise<Task | null> {
    const { rows } = await query<Task>(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async findByProject(
    projectId: string,
    filters: TaskFilters,
    { limit, offset }: { limit: number; offset: number },
  ): Promise<Task[]> {
    const { where, params } = buildWhere(projectId, filters);
    const { rows } = await query<Task>(
      `SELECT ${TASK_COLUMNS} FROM tasks
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return rows;
  },

  async countByProject(projectId: string, filters: TaskFilters): Promise<number> {
    const { where, params } = buildWhere(projectId, filters);
    const { rows } = await query<{ total: string }>(`SELECT count(*) AS total FROM tasks WHERE ${where}`, params);
    return Number(rows[0]?.total ?? 0);
  },

  async insert(projectId: string, createdBy: string, input: CreateTaskInput): Promise<Task> {
    const { rows } = await query<Task>(
      `INSERT INTO tasks (project_id, title, description, status, priority, due_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${TASK_COLUMNS}`,
      [projectId, input.title, input.description ?? null, input.status, input.priority, input.due_date ?? null, createdBy],
    );
    return rows[0]!;
  },

  async update(id: string, changes: UpdateTaskInput): Promise<Task | null> {
    const entries = Object.entries(changes).filter(([, value]) => value !== undefined);
    const sets = entries.map(([column], index) => `${column} = $${index + 1}`);
    const params = [...entries.map(([, value]) => value), id];

    const { rows } = await query<Task>(
      `UPDATE tasks SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${params.length} AND deleted_at IS NULL
       RETURNING ${TASK_COLUMNS}`,
      params,
    );
    return rows[0] ?? null;
  },

  async softDelete(id: string): Promise<void> {
    await query('UPDATE tasks SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [id]);
  },
};
