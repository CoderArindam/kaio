-- 085_subtask_assignee_time.sql
-- Add assignee_id to subtasks and subtask_id to timesheet_entries

-- 1. Schema Updates
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS subtask_id UUID NULL;

-- 2. Update v_subtasks_canonical View
DROP VIEW IF EXISTS v_subtasks_canonical CASCADE;
CREATE OR REPLACE VIEW v_subtasks_canonical AS
SELECT
    s.id,
    s.task_id,
    s.title,
    s.is_completed,
    s."position",
    s.created_by,
    COALESCE(
        NULLIF(TRIM(COALESCE(cu.first_name, '') || ' ' || COALESCE(cu.last_name, '')), ''),
        cu.email,
        ''
    ) AS creator_name,
    s.created_at,
    s.assignee_id,
    COALESCE(
        NULLIF(TRIM(COALESCE(au.first_name, '') || ' ' || COALESCE(au.last_name, '')), ''),
        au.email,
        ''
    ) AS assignee_name,
    au.email AS assignee_email,
    au.avatar_url AS assignee_avatar_url
FROM subtasks s
LEFT JOIN users cu ON s.created_by = cu.id
LEFT JOIN users au ON s.assignee_id = au.id
WHERE s.deleted_at IS NULL;


-- 3. Update v_timesheet_entries_canonical View
DROP VIEW IF EXISTS v_timesheet_entries_canonical CASCADE;
CREATE OR REPLACE VIEW v_timesheet_entries_canonical AS
SELECT 
  e.id,
  e.timesheet_id,
  e.user_id,
  e.board_id,
  e.task_id,
  e.subtask_id,
  e.entry_date,
  e.hours,
  e.entry_type,
  e.description,
  e.is_overtime,
  e.created_at,
  e.updated_at,
  b.name AS board_name,
  tk.title AS task_title,
  st.title AS subtask_title,
  t.week_start_date, 
  t.week_end_date, 
  t.status AS timesheet_status
FROM timesheet_entries e
JOIN timesheets t ON t.id = e.timesheet_id
LEFT JOIN boards b ON (b.id::text = e.board_id::text OR b.id::text = LTRIM(RIGHT(e.board_id::text, 12), '0') OR e.board_id::text = LTRIM(RIGHT(b.id::text, 12), '0'))
LEFT JOIN tasks tk ON (tk.id::text = e.task_id::text OR tk.id::text = LTRIM(RIGHT(e.task_id::text, 12), '0') OR e.task_id::text = LTRIM(RIGHT(tk.id::text, 12), '0'))
LEFT JOIN subtasks st ON (st.id::text = e.subtask_id::text OR st.id::text = LTRIM(RIGHT(e.subtask_id::text, 12), '0') OR e.subtask_id::text = LTRIM(RIGHT(st.id::text, 12), '0'));


-- 4. Update fn_create_subtask
CREATE OR REPLACE FUNCTION fn_create_subtask(
    p_task_id INTEGER,
    p_title TEXT,
    p_user_id INTEGER,
    p_assignee_id INTEGER DEFAULT NULL
) RETURNS TABLE(
    id INTEGER,
    task_id INTEGER,
    title TEXT,
    is_completed BOOLEAN,
    "position" INTEGER,
    created_by INTEGER,
    created_at TIMESTAMP WITH TIME ZONE,
    assignee_id INTEGER
) AS $$
DECLARE
    v_board_id INTEGER;
    v_next_pos INTEGER;
    v_task_assigned_to INTEGER;
    v_final_assignee_id INTEGER;
BEGIN
    SELECT t.board_id, t.assigned_to INTO v_board_id, v_task_assigned_to
    FROM tasks t
    WHERE t.id = p_task_id AND t.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found: %', p_task_id;
    END IF;

    IF NOT fn_check_board_access(p_user_id, v_board_id, 'EDIT') THEN
        RAISE EXCEPTION 'Access denied: Insufficient permissions for task %', p_task_id;
    END IF;

    SELECT COALESCE(MAX(s."position"), 0) + 1 INTO v_next_pos
    FROM subtasks s
    WHERE s.task_id = p_task_id AND s.deleted_at IS NULL;
    
    -- Inherit parent task assignee if p_assignee_id is not provided
    IF p_assignee_id IS NOT NULL THEN
        v_final_assignee_id := p_assignee_id;
    ELSE
        v_final_assignee_id := v_task_assigned_to;
    END IF;

    RETURN QUERY
    INSERT INTO subtasks (task_id, title, is_completed, "position", created_by, assignee_id)
    VALUES (p_task_id, TRIM(p_title), FALSE, v_next_pos, p_user_id, v_final_assignee_id)
    RETURNING subtasks.id, subtasks.task_id, subtasks.title, subtasks.is_completed, subtasks."position", subtasks.created_by, subtasks.created_at, subtasks.assignee_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Update fn_upsert_timesheet_entry
CREATE OR REPLACE FUNCTION fn_upsert_timesheet_entry(
    p_timesheet_id UUID,
    p_user_id UUID,
    p_board_id UUID,
    p_task_id UUID,
    p_entry_date DATE,
    p_hours NUMERIC(4,2),
    p_entry_type timesheet_entry_type DEFAULT 'task',
    p_description TEXT DEFAULT NULL,
    p_entry_id UUID DEFAULT NULL,
    p_subtask_id UUID DEFAULT NULL
)
RETURNS SETOF timesheet_entries AS $$
DECLARE
    v_status timesheet_status;
    v_ts_user_id UUID;
    v_org_id UUID;
    v_week_start DATE;
    v_week_end DATE;
    v_policy RECORD;
    v_existing_day_hours NUMERIC(4,2) := 0.00;
    v_new_day_hours NUMERIC(4,2);
    v_is_overtime BOOLEAN := false;
    v_result_entry timesheet_entries;
BEGIN
    -- Verify timesheet exists and belongs to user
    SELECT status, user_id, org_id, week_start_date, week_end_date
    INTO v_status, v_ts_user_id, v_org_id, v_week_start, v_week_end
    FROM timesheets WHERE id = p_timesheet_id FOR UPDATE;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'TIMESHEET_NOT_FOUND: Timesheet does not exist';
    END IF;

    IF v_ts_user_id != p_user_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User does not own this timesheet';
    END IF;

    IF v_status != 'draft' THEN
        RAISE EXCEPTION 'TIMESHEET_LOCKED: Entries can only be modified when status is draft';
    END IF;

    IF p_entry_date < v_week_start OR p_entry_date > v_week_end THEN
        RAISE EXCEPTION 'DATE_OUT_OF_WEEK_RANGE: Entry date must fall within week boundaries (% to %)', v_week_start, v_week_end;
    END IF;

    -- Evaluate org policy limits
    SELECT * INTO v_policy FROM timesheet_policies WHERE (org_id::text = v_org_id::text OR LTRIM(RIGHT(org_id::text, 12), '0') = LTRIM(RIGHT(v_org_id::text, 12), '0'));

    IF v_policy IS NOT NULL THEN
        IF NOT COALESCE(v_policy.allow_future_entry, false) AND p_entry_date > CURRENT_DATE THEN
            RAISE EXCEPTION 'FUTURE_ENTRY_NOT_ALLOWED: Future date entries are restricted by organization policy';
        END IF;

        IF v_policy.allow_past_entry_days IS NOT NULL AND p_entry_date < (CURRENT_DATE - v_policy.allow_past_entry_days) THEN
            RAISE EXCEPTION 'PAST_ENTRY_NOT_ALLOWED: Entry date is beyond the allowed past entry window (% days)', v_policy.allow_past_entry_days;
        END IF;

        IF COALESCE(v_policy.require_task_link, false) AND p_task_id IS NULL AND p_entry_type = 'task' THEN
            RAISE EXCEPTION 'TASK_LINK_REQUIRED: Task selection is required by organization policy';
        END IF;
    END IF;

    -- Auto-detect existing entry for same board, task, subtask, date, entry_type if p_entry_id is NULL
    IF p_entry_id IS NULL THEN
        SELECT id INTO p_entry_id
        FROM timesheet_entries
        WHERE timesheet_id = p_timesheet_id
          AND ((p_board_id IS NULL AND board_id IS NULL) OR (p_board_id IS NOT NULL AND (board_id::text = p_board_id::text OR board_id::text = LTRIM(RIGHT(p_board_id::text, 12), '0') OR p_board_id::text = LTRIM(RIGHT(board_id::text, 12), '0'))))
          AND ((p_task_id IS NULL AND task_id IS NULL) OR (p_task_id IS NOT NULL AND (task_id::text = p_task_id::text OR task_id::text = LTRIM(RIGHT(p_task_id::text, 12), '0') OR p_task_id::text = LTRIM(RIGHT(task_id::text, 12), '0'))))
          AND ((p_subtask_id IS NULL AND subtask_id IS NULL) OR (p_subtask_id IS NOT NULL AND (subtask_id::text = p_subtask_id::text OR subtask_id::text = LTRIM(RIGHT(p_subtask_id::text, 12), '0') OR p_subtask_id::text = LTRIM(RIGHT(subtask_id::text, 12), '0'))))
          AND entry_date = p_entry_date
          AND entry_type = p_entry_type
        LIMIT 1;
    END IF;

    -- If hours <= 0, delete entry if present
    IF p_hours <= 0 THEN
        IF p_entry_id IS NOT NULL THEN
            DELETE FROM timesheet_entries WHERE id = p_entry_id AND timesheet_id = p_timesheet_id;
            UPDATE timesheets
            SET total_hours = (SELECT COALESCE(SUM(hours), 0.00) FROM timesheet_entries WHERE timesheet_id = p_timesheet_id),
                updated_at = NOW()
            WHERE id = p_timesheet_id;
        END IF;
        RETURN;
    END IF;

    -- Calculate daily hours total for overtime evaluation
    SELECT COALESCE(SUM(hours), 0.00) INTO v_existing_day_hours
    FROM timesheet_entries
    WHERE user_id = p_user_id
      AND entry_date = p_entry_date
      AND (p_entry_id IS NULL OR id != p_entry_id);

    v_new_day_hours := v_existing_day_hours + p_hours;

    IF v_policy IS NOT NULL AND v_policy.max_hours_per_day IS NOT NULL AND v_new_day_hours > v_policy.max_hours_per_day THEN
        IF v_policy.overtime_policy = 'block_submission' THEN
            RAISE EXCEPTION 'OVERTIME_BLOCKED: Total hours for % (%) exceeds maximum daily limit (%)', p_entry_date, v_new_day_hours, v_policy.max_hours_per_day;
        ELSIF v_policy.overtime_policy = 'flag_only' THEN
            v_is_overtime := true;
        END IF;
    END IF;

    -- Upsert entry record
    IF p_entry_id IS NOT NULL THEN
        UPDATE timesheet_entries SET
            board_id = p_board_id,
            task_id = p_task_id,
            subtask_id = p_subtask_id,
            entry_date = p_entry_date,
            hours = p_hours,
            entry_type = p_entry_type,
            description = p_description,
            is_overtime = v_is_overtime,
            updated_at = NOW()
        WHERE id = p_entry_id AND timesheet_id = p_timesheet_id
        RETURNING * INTO v_result_entry;
    ELSE
        INSERT INTO timesheet_entries (
            timesheet_id, user_id, board_id, task_id, subtask_id, entry_date, hours, entry_type, description, is_overtime, created_at, updated_at
        ) VALUES (
            p_timesheet_id, p_user_id, p_board_id, p_task_id, p_subtask_id, p_entry_date, p_hours, p_entry_type, p_description, v_is_overtime, NOW(), NOW()
        )
        RETURNING * INTO v_result_entry;
    END IF;

    -- Recalculate parent header total_hours
    UPDATE timesheets
    SET total_hours = (SELECT COALESCE(SUM(hours), 0.00) FROM timesheet_entries WHERE timesheet_id = p_timesheet_id),
        updated_at = NOW()
    WHERE id = p_timesheet_id;

    RETURN NEXT v_result_entry;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
