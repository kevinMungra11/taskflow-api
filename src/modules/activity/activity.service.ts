import { query } from '../../db/pool.js';
import type { Page, Pagination } from '../../utils/pagination.js';
import { assertProjectMember } from '../projects/projects.service.js';

export type ActivityType = 'task_created' | 'task_updated' | 'task_deleted';

export interface ActivityEvent {
  id: string;
  project_id: string;
  actor_id: string | null;
  actor_name: string | null;
  type: ActivityType;
  task_id: string | null;
  payload: Record<string, unknown>;
  created_at: Date;
}

export async function recordActivity(event: {
  projectId: string;
  actorId: string;
  type: ActivityType;
  taskId?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO activity_events (project_id, actor_id, type, task_id, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [event.projectId, event.actorId, event.type, event.taskId ?? null, JSON.stringify(event.payload ?? {})],
  );
}

export async function listActivity(
  projectId: string,
  userId: string,
  { page, pageSize }: Pagination,
): Promise<Page<ActivityEvent>> {
  await assertProjectMember(projectId, userId);

  const offset = page * pageSize;
  const [list, count] = await Promise.all([
    query<ActivityEvent>(
      `SELECT e.id, e.project_id, e.actor_id, u.name AS actor_name, e.type, e.task_id, e.payload, e.created_at
       FROM activity_events e
       LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.project_id = $1
       ORDER BY e.created_at DESC
       LIMIT $2 OFFSET $3`,
      [projectId, pageSize, offset],
    ),
    query<{ total: string }>('SELECT count(*) AS total FROM activity_events WHERE project_id = $1', [projectId]),
  ]);

  const total = Number(count.rows[0]?.total ?? 0);
  return { items: list.rows, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
