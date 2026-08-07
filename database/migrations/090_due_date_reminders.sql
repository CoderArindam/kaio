-- Migration 090: Due Date Reminders

-- 1. Add reminder_sent_at column
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP WITH TIME ZONE NULL;

-- 2. Trigger function to auto-set reminder_at based on due_date
CREATE OR REPLACE FUNCTION fn_auto_set_task_reminder()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.due_date IS NOT NULL THEN
        NEW.reminder_at = NEW.due_date - INTERVAL '1 day';
        
        -- If due_date has changed, reset reminder_sent_at to allow a new reminder to fire
        IF OLD.due_date IS NULL OR NEW.due_date <> OLD.due_date THEN
            NEW.reminder_sent_at = NULL;
        END IF;
    ELSE
        NEW.reminder_at = NULL;
        NEW.reminder_sent_at = NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for INSERT OR UPDATE
DROP TRIGGER IF EXISTS trg_tasks_auto_set_reminder ON tasks;
CREATE TRIGGER trg_tasks_auto_set_reminder
BEFORE INSERT OR UPDATE OF due_date ON tasks
FOR EACH ROW
EXECUTE FUNCTION fn_auto_set_task_reminder();

-- Apply it retrospectively for existing tasks with due dates
UPDATE tasks
SET reminder_at = due_date - INTERVAL '1 day'
WHERE due_date IS NOT NULL AND reminder_at IS NULL;

-- 3. Function to get due reminders with SKIP LOCKED for concurrency
CREATE OR REPLACE FUNCTION fn_get_due_reminders(p_batch_size INT DEFAULT 50)
RETURNS TABLE (
    task_id INT,
    title VARCHAR,
    board_id INT,
    board_name VARCHAR,
    assigned_to INT,
    organization_id INT
) AS $$
BEGIN
    RETURN QUERY
    WITH locked_tasks AS (
        SELECT t.id
        FROM tasks t
        WHERE t.reminder_at <= NOW()
          AND t.reminder_sent_at IS NULL
          AND t.deleted_at IS NULL
          AND t.assigned_to IS NOT NULL
        ORDER BY t.reminder_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    SELECT u.id, u.title, u.board_id, b.name::VARCHAR, u.assigned_to, b.organization_id
    FROM tasks u
    JOIN boards b ON u.board_id = b.id
    JOIN locked_tasks lt ON u.id = lt.id;
END;
$$ LANGUAGE plpgsql;

-- 4. Function to mark reminders as sent (using array of task_ids)
CREATE OR REPLACE FUNCTION fn_mark_reminders_sent(p_task_ids INT[])
RETURNS VOID AS $$
BEGIN
    UPDATE tasks
    SET reminder_sent_at = NOW()
    WHERE id = ANY(p_task_ids);
END;
$$ LANGUAGE plpgsql;
