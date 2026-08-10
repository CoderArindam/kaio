-- 096_boards_canonical_restore_favorite.sql
-- Restore is_favorited and user_can_manage columns that were accidentally dropped from v_boards_canonical in migration 093

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
    ) AS columns,
    EXISTS (
        SELECT 1 FROM user_board_favorites f
        WHERE f.board_id = b.id
          AND f.user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
    ) AS is_favorited,
    can_manage_board(
        NULLIF(current_setting('app.current_user_id', true), '')::integer,
        b.id
    ) AS user_can_manage
FROM boards b
WHERE b.deleted_at IS NULL;
