-- 078_board_favorites.sql
-- Board favoriting / pinning migration

-- 1. Create user_board_favorites table
CREATE TABLE IF NOT EXISTS user_board_favorites (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, board_id)
);

CREATE INDEX IF NOT EXISTS idx_user_board_favorites_user_id ON user_board_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_board_favorites_board_id ON user_board_favorites(board_id);

-- 2. Stored procedure: fn_toggle_board_favorite
CREATE OR REPLACE FUNCTION fn_toggle_board_favorite(
    p_user_id INTEGER,
    p_board_id INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    IF NOT can_view_board(p_user_id, p_board_id) THEN
        RAISE EXCEPTION 'Access denied: User % cannot view board %', p_user_id, p_board_id;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM user_board_favorites
        WHERE user_id = p_user_id AND board_id = p_board_id
    ) INTO v_exists;

    IF v_exists THEN
        DELETE FROM user_board_favorites
        WHERE user_id = p_user_id AND board_id = p_board_id;
        RETURN FALSE;
    ELSE
        INSERT INTO user_board_favorites (user_id, board_id)
        VALUES (p_user_id, p_board_id)
        ON CONFLICT (user_id, board_id) DO NOTHING;
        RETURN TRUE;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update v_boards_canonical view to include is_favorited column
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
    ) AS columns,
    EXISTS (
        SELECT 1 FROM user_board_favorites f
        WHERE f.board_id = b.id
          AND f.user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
    ) AS is_favorited
FROM boards b
WHERE b.deleted_at IS NULL;
