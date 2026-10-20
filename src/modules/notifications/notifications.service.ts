import { query } from '../../db/pool.js';
import { notFound } from '../../utils/errors.js';
import { toLimitOffset, toPage, type Page, type Pagination } from '../../utils/pagination.js';

export type NotificationType = 'task_assigned';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  read_at: Date | null;
  created_at: Date;
}

const NOTIFICATION_COLUMNS = 'id, user_id, type, payload, read_at, created_at';

export async function createNotification(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<Notification> {
  const { rows } = await query<Notification>(
    `INSERT INTO notifications (user_id, type, payload)
     VALUES ($1, $2, $3)
     RETURNING ${NOTIFICATION_COLUMNS}`,
    [userId, type, JSON.stringify(payload)],
  );
  return rows[0]!;
}

export async function listNotifications(
  userId: string,
  pagination: Pagination & { unreadOnly?: boolean },
): Promise<Page<Notification>> {
  const { limit, offset } = toLimitOffset(pagination);
  const where = pagination.unreadOnly ? 'user_id = $1 AND read_at IS NULL' : 'user_id = $1';

  const [list, count] = await Promise.all([
    query<Notification>(
      `SELECT ${NOTIFICATION_COLUMNS} FROM notifications
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    ),
    query<{ total: string }>(`SELECT count(*) AS total FROM notifications WHERE ${where}`, [userId]),
  ]);

  return toPage(list.rows, Number(count.rows[0]?.total ?? 0), pagination);
}

export async function markAsRead(notificationId: string): Promise<Notification> {
  const { rows } = await query<Notification>(
    `UPDATE notifications SET read_at = COALESCE(read_at, now())
     WHERE id = $1
     RETURNING ${NOTIFICATION_COLUMNS}`,
    [notificationId],
  );
  const notification = rows[0];
  if (!notification) throw notFound('Notification not found');
  return notification;
}
