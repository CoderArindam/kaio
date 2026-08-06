-- 080_task_estimation.sql
-- Add estimate_hours to tasks, update canonical view v_tasks_canonical, and add fn_log_task_time function

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimate_hours NUMERIC(5,2) NULL;

DROP VIEW IF EXISTS v_tasks_canonical CASCADE;

CREATE OR REPLACE VIEW v_tasks_canonical AS
SELECT
    t.id,
    t.board_id,
    b.name AS board_name,
    b.organization_id,
    (b.project_key || '-' || t.project_sequence_id) AS task_reference,
    t.column_id,
    c.name AS column_name,
    c.column_type,
    (c.column_type = 'DONE') AS is_completed,
    t.title,
    t.description,
    t.priority,
    t.estimate_hours,
    t.due_date,
    t.reminder_at,
    t.completed_at,
    t.created_at,
    t.updated_at,
    
    -- Assignee Info
    t.assigned_to,
    au.email AS assignee_email,
    au.first_name AS assignee_first_name,
    au.last_name AS assignee_last_name,
    au.avatar_url AS assignee_avatar_url,
    
    -- Creator Info
    t.created_by,
    cu.email AS creator_email,
    cu.first_name AS creator_first_name,
    cu.last_name AS creator_last_name,
    cu.avatar_url AS creator_avatar_url,

    -- Aggregated Labels JSON array
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'id', l.id,
                    'board_id', l.board_id,
                    'name', l.name,
                    'color', l.color,
                    'created_at', l.created_at
                ) ORDER BY l.name ASC
            )
            FROM task_labels tl
            JOIN labels l ON tl.label_id = l.id
            WHERE tl.task_id = t.id
        ),
        '[]'::json
    ) AS labels,

    -- Subtask Aggregates
    COALESCE(
        (SELECT COUNT(*)::INTEGER FROM subtasks st WHERE st.task_id = t.id AND st.deleted_at IS NULL),
        0
    ) AS subtask_count,
    COALESCE(
        (SELECT COUNT(*)::INTEGER FROM subtasks st WHERE st.task_id = t.id AND st.is_completed = TRUE AND st.deleted_at IS NULL),
        0
    ) AS completed_subtask_count,

    -- Logged Hours Aggregate
    COALESCE(
        (
            SELECT SUM(te.hours)::NUMERIC(6,2)
            FROM timesheet_entries te
            WHERE te.task_id::text = t.id::text
               OR te.task_id::text = LTRIM(RIGHT(t.id::text, 12), '0')
               OR t.id::text = LTRIM(RIGHT(te.task_id::text, 12), '0')
        ),
        0.00
    ) AS logged_hours

FROM tasks t
JOIN boards b ON t.board_id = b.id
JOIN board_columns c ON t.column_id = c.id
LEFT JOIN users au ON t.assigned_to = au.id
LEFT JOIN users cu ON t.created_by = cu.id
WHERE t.deleted_at IS NULL
  AND b.deleted_at IS NULL;


CREATE OR REPLACE FUNCTION fn_log_task_time(
    p_user_id UUID,
    p_org_id UUID,
    p_task_id INT,
    p_entry_date DATE,
    p_hours NUMERIC(4,2),
    p_description TEXT DEFAULT NULL
)
RETURNS SETOF v_tasks_canonical AS $$
DECLARE
    v_board_id_int INT;
    v_assigned_to_int INT;
    v_week_start DATE;
    v_ts_id UUID;
    v_ts_status timesheet_status;
    v_task_uuid UUID;
    v_board_uuid UUID;
    v_ts_row RECORD;
BEGIN
    -- Verify task exists and retrieve details
    SELECT board_id, assigned_to INTO v_board_id_int, v_assigned_to_int
    FROM tasks
    WHERE id = p_task_id AND deleted_at IS NULL;

    IF v_board_id_int IS NULL THEN
        RAISE EXCEPTION 'TASK_NOT_FOUND: Task % does not exist', p_task_id;
    END IF;

    -- Calculate Monday week start date
    v_week_start := date_trunc('week', p_entry_date)::date;

    -- Look for existing timesheet for this user & week
    SELECT id, status INTO v_ts_id, v_ts_status
    FROM timesheets
    WHERE org_id = p_org_id AND user_id = p_user_id AND week_start_date = v_week_start
    FOR UPDATE;

    IF v_ts_id IS NULL THEN
        -- Auto-create draft timesheet
        SELECT * INTO v_ts_row FROM fn_create_timesheet(p_user_id, p_org_id, v_week_start);
        v_ts_id := v_ts_row.id;
        v_ts_status := 'draft';
    ELSIF v_ts_status != 'draft' THEN
        RAISE EXCEPTION 'TIMESHEET_LOCKED: Timesheet for week of % is % and cannot be modified', v_week_start, v_ts_status;
    END IF;

    -- Format task_id and board_id to standard 12-digit integer UUIDs for timesheet_entries
    v_task_uuid := ('00000000-0000-0000-0000-' || LPAD(p_task_id::text, 12, '0'))::uuid;
    v_board_uuid := ('00000000-0000-0000-0000-' || LPAD(v_board_id_int::text, 12, '0'))::uuid;

    -- Insert or update timesheet entry
    PERFORM fn_upsert_timesheet_entry(
        v_ts_id,
        p_user_id,
        v_board_uuid,
        v_task_uuid,
        p_entry_date,
        p_hours,
        'task'::timesheet_entry_type,
        p_description
    );

    RETURN QUERY SELECT * FROM v_tasks_canonical WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;
