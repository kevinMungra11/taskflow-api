import { query, withTransaction } from '../../db/pool.js';
import { badRequest, conflict, forbidden, isUniqueViolation, notFound } from '../../utils/errors.js';
import { toLimitOffset, toPage, type Page, type Pagination } from '../../utils/pagination.js';
import { findUserByEmail } from '../users/users.service.js';

export type ProjectRole = 'owner' | 'member';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectMember {
  user_id: string;
  email: string;
  name: string;
  role: ProjectRole;
  joined_at: Date;
}

const PROJECT_COLUMNS = 'p.id, p.name, p.description, p.owner_id, p.created_at, p.updated_at';

export async function getMemberRole(projectId: string, userId: string): Promise<ProjectRole | null> {
  const { rows } = await query<{ role: ProjectRole }>(
    'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, userId],
  );
  return rows[0]?.role ?? null;
}

export async function isProjectMember(projectId: string, userId: string): Promise<boolean> {
  return (await getMemberRole(projectId, userId)) !== null;
}

/**
 * Throws 404 rather than 403 for non-members so we don't reveal which project ids exist.
 */
export async function assertProjectMember(projectId: string, userId: string): Promise<ProjectRole> {
  const role = await getMemberRole(projectId, userId);
  if (!role) throw notFound('Project not found');
  return role;
}

export async function assertProjectOwner(projectId: string, userId: string): Promise<void> {
  const role = await assertProjectMember(projectId, userId);
  if (role !== 'owner') throw forbidden('Only the project owner can do this');
}

export async function createProject(
  ownerId: string,
  input: { name: string; description?: string },
): Promise<Project> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<Project>(
      `INSERT INTO projects (name, description, owner_id)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, owner_id, created_at, updated_at`,
      [input.name, input.description ?? null, ownerId],
    );
    const project = rows[0]!;
    await client.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [project.id, ownerId],
    );
    return project;
  });
}

export async function listProjectsForUser(userId: string, pagination: Pagination): Promise<Page<Project>> {
  const { limit, offset } = toLimitOffset(pagination);
  const [list, count] = await Promise.all([
    query<Project>(
      `SELECT ${PROJECT_COLUMNS}
       FROM projects p
       JOIN project_members m ON m.project_id = p.id
       WHERE m.user_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    ),
    query<{ total: string }>('SELECT count(*) AS total FROM project_members WHERE user_id = $1', [userId]),
  ]);
  return toPage(list.rows, Number(count.rows[0]?.total ?? 0), pagination);
}

export async function getProject(projectId: string, userId: string): Promise<Project> {
  await assertProjectMember(projectId, userId);
  const { rows } = await query<Project>(`SELECT ${PROJECT_COLUMNS} FROM projects p WHERE p.id = $1`, [projectId]);
  const project = rows[0];
  if (!project) throw notFound('Project not found');
  return project;
}

export async function listMembers(projectId: string, userId: string): Promise<ProjectMember[]> {
  await assertProjectMember(projectId, userId);
  const { rows } = await query<ProjectMember>(
    `SELECT u.id AS user_id, u.email, u.name, m.role, m.joined_at
     FROM project_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.project_id = $1
     ORDER BY m.joined_at ASC`,
    [projectId],
  );
  return rows;
}

export async function addMember(projectId: string, actorId: string, email: string): Promise<ProjectMember> {
  await assertProjectOwner(projectId, actorId);

  const user = await findUserByEmail(email);
  if (!user) throw notFound('No user with that email');

  try {
    const { rows } = await query<{ joined_at: Date }>(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'member')
       RETURNING joined_at`,
      [projectId, user.id],
    );
    return { user_id: user.id, email: user.email, name: user.name, role: 'member', joined_at: rows[0]!.joined_at };
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('User is already a member of this project');
    throw err;
  }
}

export async function removeMember(projectId: string, actorId: string, memberId: string): Promise<void> {
  await assertProjectOwner(projectId, actorId);

  const role = await getMemberRole(projectId, memberId);
  if (!role) throw notFound('Member not found');
  if (role === 'owner') throw badRequest('The project owner cannot be removed');

  await query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, memberId]);
}

export interface ProjectStats {
  total: number;
  byStatus: Record<'todo' | 'in_progress' | 'done', number>;
  overdue: number;
  completionRate: number;
}

export async function getProjectStats(projectId: string, userId: string): Promise<ProjectStats> {
  await assertProjectMember(projectId, userId);

  const { rows } = await query<{ status: 'todo' | 'in_progress' | 'done'; count: string; overdue: string }>(
    `SELECT status,
            count(*) AS count,
            count(*) FILTER (WHERE due_date < CURRENT_DATE AND status <> 'done') AS overdue
     FROM tasks
     WHERE project_id = $1
     GROUP BY status`,
    [projectId],
  );

  const byStatus = { todo: 0, in_progress: 0, done: 0 };
  let overdue = 0;
  for (const row of rows) {
    byStatus[row.status] = Number(row.count);
    overdue += Number(row.overdue);
  }
  const total = byStatus.todo + byStatus.in_progress + byStatus.done;

  return {
    total,
    byStatus,
    overdue,
    completionRate: Math.round((byStatus.done / total) * 100),
  };
}
