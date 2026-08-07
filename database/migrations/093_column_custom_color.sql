-- 093_column_custom_color.sql

-- 1. Add color column to board_columns
ALTER TABLE board_columns ADD COLUMN IF NOT EXISTS color VARCHAR(7);

-- 2. Drop old functions to avoid signature conflicts
DROP FUNCTION IF EXISTS fn_add_column(INTEGER, TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS fn_rename_column(INTEGER, TEXT, TEXT, INTEGER);

-- 3. Recreate fn_add_column with color
CREATE OR REPLACE FUNCTION fn_add_column(
    p_board_id INTEGER,
    p_name TEXT,
    p_column_type TEXT DEFAULT 'TODO',
    p_position INTEGER DEFAULT NULL,
    p_user_id INTEGER DEFAULT NULL,
    p_color TEXT DEFAULT NULL
) RETURNS TABLE(
    id INTEGER,
    board_id INTEGER,
    name VARCHAR(255),
    "position" INTEGER,
    column_type column_type_enum,
    color VARCHAR(7),
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
        jsonb_build_object('name', TRIM(p_name), 'position', v_pos, 'column_type', v_type, 'color', p_color),
        jsonb_build_object('action', 'column_created')
    );

    RETURN QUERY
    INSERT INTO board_columns (board_id, name, "position", column_type, color)
    VALUES (p_board_id, TRIM(p_name), v_pos, v_type, p_color)
    RETURNING board_columns.id, board_columns.board_id, board_columns.name, board_columns."position", board_columns.column_type, board_columns.color, board_columns.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Recreate fn_rename_column with color
CREATE OR REPLACE FUNCTION fn_rename_column(
    p_column_id INTEGER,
    p_name TEXT DEFAULT NULL,
    p_column_type TEXT DEFAULT NULL,
    p_user_id INTEGER DEFAULT NULL,
    p_color TEXT DEFAULT NULL
) RETURNS TABLE(
    id INTEGER,
    board_id INTEGER,
    name VARCHAR(255),
    "position" INTEGER,
    column_type column_type_enum,
    color VARCHAR(7),
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
        jsonb_build_object('column_id', p_column_id, 'name', TRIM(p_name), 'column_type', v_new_type, 'color', p_color),
        jsonb_build_object('action', 'column_updated')
    );

    RETURN QUERY
    UPDATE board_columns
    SET name = COALESCE(NULLIF(TRIM(p_name), ''), board_columns.name),
        column_type = COALESCE(v_new_type, board_columns.column_type),
        color = COALESCE(p_color, board_columns.color)
    WHERE board_columns.id = p_column_id AND board_columns.deleted_at IS NULL
    RETURNING board_columns.id, board_columns.board_id, board_columns.name, board_columns."position", board_columns.column_type, board_columns.color, board_columns.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Update Canonical Boards View (v_boards_canonical) to include color
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
                'color', c.color,
                'is_completed', (c.column_type = 'DONE')
            ) ORDER BY c."position" ASC
        ) FROM board_columns c WHERE c.board_id = b.id AND c.deleted_at IS NULL),
        '[]'::json
    ) AS columns
FROM boards b
WHERE b.deleted_at IS NULL;
