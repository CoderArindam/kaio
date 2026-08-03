-- 061_subtasks_functions.sql
-- Stored procedures for subtasks: fn_create_subtask, fn_toggle_subtask, fn_delete_subtask, fn_reorder_subtasks

CREATE OR REPLACE FUNCTION fn_create_subtask(
    p_task_id INTEGER,
    p_title TEXT,
    p_user_id INTEGER
) RETURNS TABLE(
    id INTEGER,
    task_id INTEGER,
    title TEXT,
    is_completed BOOLEAN,
    "position" INTEGER,
    created_by INTEGER,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    v_board_id INTEGER;
    v_next_pos INTEGER;
BEGIN
    SELECT t.board_id INTO v_board_id
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

    RETURN QUERY
    INSERT INTO subtasks (task_id, title, is_completed, "position", created_by)
    VALUES (p_task_id, TRIM(p_title), FALSE, v_next_pos, p_user_id)
    RETURNING subtasks.id, subtasks.task_id, subtasks.title, subtasks.is_completed, subtasks."position", subtasks.created_by, subtasks.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION fn_toggle_subtask(
    p_subtask_id INTEGER,
    p_user_id INTEGER
) RETURNS TABLE(
    id INTEGER,
    task_id INTEGER,
    title TEXT,
    is_completed BOOLEAN,
    "position" INTEGER,
    created_by INTEGER,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    v_task_id INTEGER;
    v_board_id INTEGER;
BEGIN
    SELECT s.task_id, t.board_id INTO v_task_id, v_board_id
    FROM subtasks s
    JOIN tasks t ON s.task_id = t.id
    WHERE s.id = p_subtask_id AND s.deleted_at IS NULL AND t.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subtask not found: %', p_subtask_id;
    END IF;

    IF NOT fn_check_board_access(p_user_id, v_board_id, 'EDIT') THEN
        RAISE EXCEPTION 'Access denied: Insufficient permissions for subtask %', p_subtask_id;
    END IF;

    RETURN QUERY
    UPDATE subtasks
    SET is_completed = NOT subtasks.is_completed
    WHERE subtasks.id = p_subtask_id
    RETURNING subtasks.id, subtasks.task_id, subtasks.title, subtasks.is_completed, subtasks."position", subtasks.created_by, subtasks.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION fn_delete_subtask(
    p_subtask_id INTEGER,
    p_user_id INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_task_id INTEGER;
    v_board_id INTEGER;
BEGIN
    SELECT s.task_id, t.board_id INTO v_task_id, v_board_id
    FROM subtasks s
    JOIN tasks t ON s.task_id = t.id
    WHERE s.id = p_subtask_id AND s.deleted_at IS NULL AND t.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subtask not found: %', p_subtask_id;
    END IF;

    IF NOT fn_check_board_access(p_user_id, v_board_id, 'EDIT') THEN
        RAISE EXCEPTION 'Access denied: Insufficient permissions to delete subtask %', p_subtask_id;
    END IF;

    UPDATE subtasks
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = p_subtask_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION fn_reorder_subtasks(
    p_task_id INTEGER,
    p_ordered_ids INTEGER[],
    p_user_id INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_board_id INTEGER;
    idx INTEGER;
BEGIN
    SELECT t.board_id INTO v_board_id
    FROM tasks t
    WHERE t.id = p_task_id AND t.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found: %', p_task_id;
    END IF;

    IF NOT fn_check_board_access(p_user_id, v_board_id, 'EDIT') THEN
        RAISE EXCEPTION 'Access denied: Insufficient permissions to reorder subtasks on task %', p_task_id;
    END IF;

    IF p_ordered_ids IS NOT NULL AND array_length(p_ordered_ids, 1) > 0 THEN
        FOR idx IN 1..array_length(p_ordered_ids, 1) LOOP
            UPDATE subtasks
            SET "position" = idx
            WHERE id = p_ordered_ids[idx] AND task_id = p_task_id AND deleted_at IS NULL;
        END LOOP;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
