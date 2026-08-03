-- 063_column_management_functions.sql
-- Dynamic Kanban column management stored procedures & canonical view update

-- 1. Ensure board_columns table has deleted_at column for soft deletes
ALTER TABLE board_columns ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- 2. Stored procedure: fn_add_column
CREATE OR REPLACE FUNCTION fn_add_column(
    p_board_id INTEGER,
    p_name TEXT,
    p_column_type TEXT DEFAULT 'TODO',
    p_position INTEGER DEFAULT NULL,
    p_user_id INTEGER DEFAULT NULL
) RETURNS TABLE(
    id INTEGER,
    board_id INTEGER,
    name VARCHAR(255),
    "position" INTEGER,
    column_type column_type_enum,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    v_org_id INTEGER;
    v_pos INTEGER;
    v_type column_type_enum;
BEGIN
    SELECT b.organization_id INTO v_org_id
    FROM boards b
    WHERE b.id = p_board_id AND b.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Board not found: %', p_board_id;
    END IF;

    IF p_user_id IS NOT NULL AND NOT fn_check_user_has_management_role(p_user_id, v_org_id) THEN
        RAISE EXCEPTION 'Access denied: Insufficient permissions for board %', p_board_id;
    END IF;

    IF p_position IS NULL OR p_position <= 0 THEN
        SELECT COALESCE(MAX(c."position"), 0) + 1 INTO v_pos
        FROM board_columns c
        WHERE c.board_id = p_board_id AND c.deleted_at IS NULL;
    ELSE
        v_pos := p_position;
    END IF;

    v_type := COALESCE(NULLIF(TRIM(p_column_type), ''), 'TODO')::column_type_enum;

    INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value, metadata)
    VALUES (
        v_org_id, 'BOARD', p_board_id, p_user_id, 'UPDATED',
        jsonb_build_object('name', TRIM(p_name), 'position', v_pos, 'column_type', v_type),
        jsonb_build_object('action', 'column_created')
    );

    RETURN QUERY
    INSERT INTO board_columns (board_id, name, "position", column_type)
    VALUES (p_board_id, TRIM(p_name), v_pos, v_type)
    RETURNING board_columns.id, board_columns.board_id, board_columns.name, board_columns."position", board_columns.column_type, board_columns.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Stored procedure: fn_rename_column
CREATE OR REPLACE FUNCTION fn_rename_column(
    p_column_id INTEGER,
    p_name TEXT DEFAULT NULL,
    p_column_type TEXT DEFAULT NULL,
    p_user_id INTEGER DEFAULT NULL
) RETURNS TABLE(
    id INTEGER,
    board_id INTEGER,
    name VARCHAR(255),
    "position" INTEGER,
    column_type column_type_enum,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    v_board_id INTEGER;
    v_org_id INTEGER;
    v_new_type column_type_enum;
BEGIN
    SELECT c.board_id, b.organization_id INTO v_board_id, v_org_id
    FROM board_columns c
    JOIN boards b ON c.board_id = b.id
    WHERE c.id = p_column_id AND c.deleted_at IS NULL AND b.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Column not found: %', p_column_id;
    END IF;

    IF p_user_id IS NOT NULL AND NOT fn_check_user_has_management_role(p_user_id, v_org_id) THEN
        RAISE EXCEPTION 'Access denied: Insufficient permissions to modify column %', p_column_id;
    END IF;

    IF p_column_type IS NOT NULL AND TRIM(p_column_type) != '' THEN
        v_new_type := TRIM(p_column_type)::column_type_enum;
    ELSE
        v_new_type := NULL;
    END IF;

    INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value, metadata)
    VALUES (
        v_org_id, 'BOARD', v_board_id, p_user_id, 'UPDATED',
        jsonb_build_object('column_id', p_column_id, 'name', TRIM(p_name), 'column_type', v_new_type),
        jsonb_build_object('action', 'column_updated')
    );

    RETURN QUERY
    UPDATE board_columns
    SET name = COALESCE(NULLIF(TRIM(p_name), ''), board_columns.name),
        column_type = COALESCE(v_new_type, board_columns.column_type)
    WHERE board_columns.id = p_column_id AND board_columns.deleted_at IS NULL
    RETURNING board_columns.id, board_columns.board_id, board_columns.name, board_columns."position", board_columns.column_type, board_columns.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Stored procedure: fn_delete_column (Atomically migrates tasks to target_column_id, soft-deletes column)
CREATE OR REPLACE FUNCTION fn_delete_column(
    p_column_id INTEGER,
    p_target_column_id INTEGER,
    p_user_id INTEGER DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_board_id INTEGER;
    v_org_id INTEGER;
    v_target_check INTEGER;
BEGIN
    IF p_column_id = p_target_column_id THEN
        RAISE EXCEPTION 'Target column cannot be the column being deleted';
    END IF;

    SELECT c.board_id, b.organization_id INTO v_board_id, v_org_id
    FROM board_columns c
    JOIN boards b ON c.board_id = b.id
    WHERE c.id = p_column_id AND c.deleted_at IS NULL AND b.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Column to delete not found: %', p_column_id;
    END IF;

    SELECT c.id INTO v_target_check
    FROM board_columns c
    WHERE c.id = p_target_column_id AND c.board_id = v_board_id AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target column not found on board: %', p_target_column_id;
    END IF;

    IF p_user_id IS NOT NULL AND NOT fn_check_user_has_management_role(p_user_id, v_org_id) THEN
        RAISE EXCEPTION 'Access denied: Insufficient permissions to delete column %', p_column_id;
    END IF;

    -- Migrate all tasks from deleted column to target column
    UPDATE tasks
    SET column_id = p_target_column_id,
        updated_at = CURRENT_TIMESTAMP
    WHERE column_id = p_column_id AND deleted_at IS NULL;

    -- Soft-delete column
    UPDATE board_columns
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = p_column_id;

    -- Re-index position ordering of remaining active columns
    WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY "position", id) AS new_pos
        FROM board_columns
        WHERE board_id = v_board_id AND deleted_at IS NULL
    )
    UPDATE board_columns
    SET "position" = ranked.new_pos
    FROM ranked
    WHERE board_columns.id = ranked.id;

    INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, metadata)
    VALUES (
        v_org_id, 'BOARD', v_board_id, p_user_id, 'UPDATED',
        jsonb_build_object('action', 'column_deleted', 'deleted_column_id', p_column_id, 'target_column_id', p_target_column_id)
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Stored procedure: fn_reorder_columns
CREATE OR REPLACE FUNCTION fn_reorder_columns(
    p_board_id INTEGER,
    p_ordered_column_ids INTEGER[],
    p_user_id INTEGER DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_org_id INTEGER;
    idx INTEGER;
BEGIN
    SELECT b.organization_id INTO v_org_id
    FROM boards b
    WHERE b.id = p_board_id AND b.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Board not found: %', p_board_id;
    END IF;

    IF p_user_id IS NOT NULL AND NOT fn_check_user_has_management_role(p_user_id, v_org_id) THEN
        RAISE EXCEPTION 'Access denied: Insufficient permissions to reorder columns on board %', p_board_id;
    END IF;

    IF p_ordered_column_ids IS NOT NULL AND array_length(p_ordered_column_ids, 1) > 0 THEN
        FOR idx IN 1..array_length(p_ordered_column_ids, 1) LOOP
            UPDATE board_columns
            SET "position" = idx
            WHERE id = p_ordered_column_ids[idx] AND board_id = p_board_id AND deleted_at IS NULL;
        END LOOP;
    END IF;

    INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, metadata)
    VALUES (
        v_org_id, 'BOARD', p_board_id, p_user_id, 'UPDATED',
        jsonb_build_object('action', 'column_reordered', 'ordered_ids', p_ordered_column_ids)
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. Update Canonical Boards View (v_boards_canonical) to include columns array
DROP VIEW IF EXISTS v_boards_canonical CASCADE;

CREATE OR REPLACE VIEW v_boards_canonical AS
SELECT
    b.id,
    b.organization_id,
    b.name,
    b.project_key,
    b.owner_id,
    b.description,
    b.icon,
    b.color,
    b.cover_gradient,
    b.default_assignee_id,
    b.project_lead_id,
    b.created_at,
    b.archived_at,
    (SELECT COUNT(*) FROM board_members WHERE board_id = b.id) AS member_count,
    (SELECT COUNT(*) FROM tasks WHERE board_id = b.id AND deleted_at IS NULL) AS task_count,
    COALESCE(
        (SELECT json_agg(
            json_build_object(
                'id', c.id,
                'name', c.name,
                'position', c."position",
                'column_type', c.column_type,
                'is_completed', (c.column_type = 'DONE')
            ) ORDER BY c."position" ASC
        ) FROM board_columns c WHERE c.board_id = b.id AND c.deleted_at IS NULL),
        '[]'::json
    ) AS columns
FROM boards b
WHERE b.deleted_at IS NULL;
