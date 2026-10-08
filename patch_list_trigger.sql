CREATE OR REPLACE FUNCTION notify_list_change() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('tasks_changes',
    json_build_object('op', TG_OP, 'table', 'task_lists', 'id', COALESCE(NEW.id, OLD.id))::text);
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lists_notify ON task_lists;

CREATE TRIGGER lists_notify
  AFTER INSERT OR UPDATE OR DELETE ON task_lists
  FOR EACH ROW EXECUTE FUNCTION notify_list_change();