CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done');

CREATE TABLE task_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  color       TEXT DEFAULT '#3b82f6',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id     UUID REFERENCES task_lists(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  status      task_status NOT NULL DEFAULT 'todo',
  start_at    TIMESTAMPTZ,
  end_at      TIMESTAMPTZ,
  all_day     BOOLEAN DEFAULT false,
  tags        TEXT[] DEFAULT '{}',
  metadata    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tasks_start  ON tasks(start_at);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_list   ON tasks(list_id);

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_touch BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE FUNCTION notify_task_change() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('tasks_changes',
    json_build_object('op', TG_OP, 'id', COALESCE(NEW.id, OLD.id))::text);
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_notify
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_task_change();
