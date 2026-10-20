ALTER TABLE tasks ADD COLUMN assignee_id uuid REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX tasks_assignee_id_idx ON tasks (assignee_id) WHERE deleted_at IS NULL;

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_id_idx ON notifications (user_id, created_at DESC);
