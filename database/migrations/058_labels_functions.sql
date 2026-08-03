-- 058_labels_functions.sql
-- Label stored procedures with board access authorization and activity logging

CREATE OR REPLACE FUNCTION fn_check_board_access(
    p_user_id INTEGER,
    p_board_id INTEGER,
    p_required_permission TEXT DEFAULT 'EDIT'
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN can_view_board(p_user_id, p_board_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION fn_create_label(
    p_board_id INTEGER,
    p_name TEXT,
    p_color TEXT,
    p_user_id INTEGER
) RETURNS TABLE(id INTEGER, board_id INTEGER, name VARCHAR, color VARCHAR, created_at TIMESTAMP WITH TIME ZONE) AS $$
BEGIN
    IF NOT fn_check_board_access(p_user_id, p_board_id, 'EDIT') THEN
        RAISE EXCEPTION 'Access denied: Insufficient permissions to create label on board %', p_board_id;
    END IF;

    RETURN QUERY
    INSERT INTO labels (board_id, name, color)
    VALUES (p_board_id, TRIM(p_name), TRIM(p_color))
    RETURNING labels.id, labels.board_id, labels.name, labels.color, labels.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION fn_delete_label(
    p_label_id INTEGER,
    p_user_id INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_board_id INTEGER;
BEGIN
    SELECT l.board_id INTO v_board_id
    FROM labels l
    WHERE l.id = p_label_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Label not found: %', p_label_id;
    END IF;

    IF NOT fn_check_board_access(p_user_id, v_board_id, 'EDIT') THEN
        RAISE EXCEPTION 'Access denied: Insufficient permissions to delete label %', p_label_id;
    END IF;

    DELETE FROM labels WHERE id = p_label_id;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION fn_attach_label(
    p_task_id INTEGER,
    p_label_id INTEGER,
    p_user_id INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_task_board_id INTEGER;
    v_label_board_id INTEGER;
    v_label_name VARCHAR;
    v_org_id INTEGER;
BEGIN
    SELECT t.board_id, b.organization_id INTO v_task_board_id, v_org_id
    FROM tasks t
    JOIN boards b ON t.board_id = b.id
    WHERE t.id = p_task_id AND t.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found: %', p_task_id;
    END IF;

    SELECT l.board_id, l.name INTO v_label_board_id, v_label_name
    FROM labels l
    WHERE l.id = p_label_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Label not found: %', p_label_id;
    END IF;

    IF v_task_board_id != v_label_board_id THEN
        RAISE EXCEPTION 'Task and label belong to different boards';
    END IF;

    IF NOT fn_check_board_access(p_user_id, v_task_board_id, 'EDIT') THEN
        RAISE EXCEPTION 'Access denied: Insufficient permissions to modify task %', p_task_id;
    END IF;

    INSERT INTO task_labels (task_id, label_id)
    VALUES (p_task_id, p_label_id)
    ON CONFLICT (task_id, label_id) DO NOTHING;

    -- Log activity
    INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value)
    VALUES (
        v_org_id,
        'TASK'::entity_type_enum,
        p_task_id,
        p_user_id,
        'UPDATED'::activity_type_enum,
        jsonb_build_object('action', 'attach_label', 'label_id', p_label_id, 'label_name', v_label_name)
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION fn_detach_label(
    p_task_id INTEGER,
    p_label_id INTEGER,
    p_user_id INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_task_board_id INTEGER;
    v_label_board_id INTEGER;
    v_label_name VARCHAR;
    v_org_id INTEGER;
BEGIN
    SELECT t.board_id, b.organization_id INTO v_task_board_id, v_org_id
    FROM tasks t
    JOIN boards b ON t.board_id = b.id
    WHERE t.id = p_task_id AND t.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found: %', p_task_id;
    END IF;

    SELECT l.board_id, l.name INTO v_label_board_id, v_label_name
    FROM labels l
    WHERE l.id = p_label_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Label not found: %', p_label_id;
    END IF;

    IF NOT fn_check_board_access(p_user_id, v_task_board_id, 'EDIT') THEN
        RAISE EXCEPTION 'Access denied: Insufficient permissions to modify task %', p_task_id;
    END IF;

    DELETE FROM task_labels
    WHERE task_id = p_task_id AND label_id = p_label_id;

    -- Log activity
    INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, old_value)
    VALUES (
        v_org_id,
        'TASK'::entity_type_enum,
        p_task_id,
        p_user_id,
        'UPDATED'::activity_type_enum,
        jsonb_build_object('action', 'detach_label', 'label_id', p_label_id, 'label_name', v_label_name)
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
