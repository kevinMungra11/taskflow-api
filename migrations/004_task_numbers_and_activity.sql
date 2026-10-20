-- Human-friendly per-project task numbers (#1, #2, ...)
ALTER TABLE tasks ADD COLUMN number integer;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at) AS n FROM tasks
)
UPDATE tasks t SET number = numbered.n FROM numbered WHERE numbered.id = t.id;

ALTER TABLE tasks ALTER COLUMN number SET NOT NULL;

CREATE TABLE activity_events (
  id         bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES users (id) ON DELETE SET NULL,
  type       text NOT NULL,
  task_id    uuid REFERENCES tasks (id) ON DELETE CASCADE,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activity_events_project_id_idx ON activity_events (project_id, created_at DESC);
