-- 052_bulk_task_operations.sql
-- Stored procedures for task move & bulk move operations

CREATE OR REPLACE FUNCTION fn_move_task(
    p_task_id INT,
    p_column_id INT,
    p_user_id INT,
    p_org_id INT
) RETURNS BOOLEAN AS $$
DECLARE
    v_board_id INT;
    v_column_board_id INT;
    v_has_access BOOLEAN;
BEGIN
    -- Get task board_id
    SELECT board_id INTO v_board_id FROM tasks WHERE id = p_task_id AND deleted_at IS NULL;
    IF v_board_id IS NULL THEN
        RAISE EXCEPTION 'Task % not found or deleted', p_task_id;
    END IF;

    -- Verify target column belongs to the same board
    SELECT board_id INTO v_column_board_id FROM board_columns WHERE id = p_column_id;
    IF v_column_board_id IS NULL OR v_column_board_id != v_board_id THEN
        RAISE EXCEPTION 'Column % does not belong to board %', p_column_id, v_board_id;
    END IF;

    -- Verify user has permission to edit task / access board
    SELECT can_edit_task(p_user_id, p_task_id) INTO v_has_access;
    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Access denied for user % to task %', p_user_id, p_task_id;
    END IF;

    -- Update column
    UPDATE tasks 
    SET column_id = p_column_id, updated_at = CURRENT_TIMESTAMP 
    WHERE id = p_task_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION fn_bulk_move_tasks(
    p_task_ids INT[],
    p_column_id INT,
    p_user_id INT,
    p_org_id INT
) RETURNS INTEGER AS $$
DECLARE
    v_task_id INT;
    v_moved_count INT := 0;
BEGIN
    IF p_task_ids IS NULL OR array_length(p_task_ids, 1) IS NULL THEN
        RETURN 0;
    END IF;

    FOREACH v_task_id IN ARRAY p_task_ids LOOP
        PERFORM fn_move_task(v_task_id, p_column_id, p_user_id, p_org_id);
        v_moved_count := v_moved_count + 1;
    END LOOP;

    RETURN v_moved_count;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION fn_bulk_delete_tasks(
    p_task_ids INT[],
    p_user_id INT
) RETURNS INTEGER AS $$
DECLARE
    v_task_id INT;
    v_deleted_count INT := 0;
    v_user_role VARCHAR;
BEGIN
    IF p_task_ids IS NULL OR array_length(p_task_ids, 1) IS NULL THEN
        RETURN 0;
    END IF;

    -- Verify user permission (Must be MANAGER or SUPER_ADMIN in users table)
    SELECT role INTO v_user_role
    FROM users
    WHERE id = p_user_id AND deleted_at IS NULL;

    IF v_user_role NOT IN ('MANAGER', 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'Only MANAGER or SUPER_ADMIN can delete tasks' USING ERRCODE = '42501';
    END IF;

    FOREACH v_task_id IN ARRAY p_task_ids LOOP
        BEGIN
            PERFORM fn_delete_task(v_task_id, p_user_id);
            v_deleted_count := v_deleted_count + 1;
        EXCEPTION WHEN OTHERS THEN
            -- Skip tasks that fail (e.g. already deleted or invalid)
            NULL;
        END;
    END LOOP;

    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

