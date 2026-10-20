import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

const { query } = await import('../src/db/pool.js');
const tasksService = await import('../src/modules/tasks/tasks.service.js');
const mockedQuery = vi.mocked(query);

const task = {
  id: 'task-1',
  project_id: 'project-1',
  title: 'Write docs',
  description: null,
  status: 'todo',
  priority: 'medium',
  due_date: null,
  created_by: 'user-1',
  created_at: new Date(),
  updated_at: new Date(),
};

describe('tasks.service', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it('hides tasks from projects the user is not a member of', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [task] } as never) // task lookup
      .mockResolvedValueOnce({ rows: [] } as never); // membership lookup

    await expect(tasksService.getTask('task-1', 'outsider')).rejects.toMatchObject({ status: 404 });
  });

  it('only updates whitelisted columns, using bound parameters', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [task] } as never)
      .mockResolvedValueOnce({ rows: [{ role: 'member' }] } as never)
      .mockResolvedValueOnce({ rows: [{ ...task, status: 'done' }] } as never);

    await tasksService.updateTask('task-1', 'user-1', { status: 'done', title: 'Write better docs' });

    const [sql, params] = mockedQuery.mock.calls[2]!;
    expect(sql).toContain('title = $1, status = $2');
    expect(params).toEqual(['Write better docs', 'done', 'task-1']);
  });

  it('filters list queries by status and priority', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ role: 'member' }] } as never)
      .mockResolvedValueOnce({ rows: [task] } as never)
      .mockResolvedValueOnce({ rows: [{ total: '1' }] } as never);

    const page = await tasksService.listTasks('project-1', 'user-1', {
      page: 2,
      pageSize: 10,
      status: 'todo',
      priority: 'high',
    });

    const [sql, params] = mockedQuery.mock.calls[1]!;
    expect(sql).toContain('status = $2 AND priority = $3');
    expect(params).toEqual(['project-1', 'todo', 'high', 10, 10]);
    expect(page).toMatchObject({ total: 1, page: 2, totalPages: 1 });
  });
});

describe('tasks.service assignment', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it('assigns a task and returns the updated row', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ ...task, assignee_id: null }] } as never) // task lookup
      .mockResolvedValueOnce({ rows: [{ role: 'member' }] } as never) // actor membership
      .mockResolvedValueOnce({ rows: [{ role: 'member' }] } as never) // assignee membership
      .mockResolvedValueOnce({ rows: [{ ...task, assignee_id: 'user-2' }] } as never) // update
      .mockResolvedValueOnce({ rows: [{ id: 'n-1' }] } as never); // notification

    const updated = await tasksService.assignTask('task-1', 'user-1', 'user-2');

    expect(updated.assignee_id).toBe('user-2');
    expect(mockedQuery.mock.calls[3]?.[1]).toEqual(['user-2', 'task-1']);
  });

  it('can unassign a task', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ ...task, assignee_id: 'user-2' }] } as never)
      .mockResolvedValueOnce({ rows: [{ role: 'member' }] } as never)
      .mockResolvedValueOnce({ rows: [{ ...task, assignee_id: null }] } as never);

    const updated = await tasksService.assignTask('task-1', 'user-1', null);

    expect(updated.assignee_id).toBeNull();
    expect(mockedQuery).toHaveBeenCalledTimes(3);
  });

  it('rejects an assignee who is not a project member', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ ...task, assignee_id: null }] } as never)
      .mockResolvedValueOnce({ rows: [{ role: 'member' }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never); // assignee not a member

    await expect(tasksService.assignTask('task-1', 'user-1', 'outsider')).rejects.toMatchObject({ status: 404 });
    expect(mockedQuery).toHaveBeenCalledTimes(3);
  });
});
