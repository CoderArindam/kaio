-- 079_comment_reactions.sql
-- Comment emoji reactions table, toggle procedure, and canonical view update

-- 1. Create comment_reactions table
CREATE TABLE IF NOT EXISTS comment_reactions (
    comment_id INTEGER NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(32) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (comment_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id ON comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_user_id ON comment_reactions(user_id);

-- 2. Stored procedure: fn_toggle_comment_reaction
CREATE OR REPLACE FUNCTION fn_toggle_comment_reaction(
    p_comment_id INTEGER,
    p_user_id INTEGER,
    p_emoji TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM task_comments WHERE id = p_comment_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Comment not found';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM comment_reactions
        WHERE comment_id = p_comment_id AND user_id = p_user_id AND emoji = p_emoji
    ) INTO v_exists;

    IF v_exists THEN
        DELETE FROM comment_reactions
        WHERE comment_id = p_comment_id AND user_id = p_user_id AND emoji = p_emoji;
        RETURN FALSE;
    ELSE
        INSERT INTO comment_reactions (comment_id, user_id, emoji)
        VALUES (p_comment_id, p_user_id, p_emoji)
        ON CONFLICT (comment_id, user_id, emoji) DO NOTHING;
        RETURN TRUE;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update v_comments_canonical view to aggregate reaction counts & user reaction state
DROP VIEW IF EXISTS v_comments_canonical CASCADE;

CREATE VIEW v_comments_canonical AS
SELECT 
    c.id,
    c.task_id,
    c.user_id,
    c.parent_comment_id,
    c.content,
    c.created_at,
    c.edited_at,
    c.deleted_at,
    u.first_name AS user_first_name,
    u.last_name AS user_last_name,
    u.avatar_url AS user_avatar_url,
    u.email AS user_email,
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'emoji', r.emoji,
                    'count', r.cnt,
                    'reacted', (NULLIF(current_setting('app.current_user_id', true), '')::integer = ANY(r.user_ids))
                ) ORDER BY r.emoji ASC
            )
            FROM (
                SELECT 
                    emoji, 
                    COUNT(*)::integer AS cnt,
                    array_agg(user_id) AS user_ids
                FROM comment_reactions
                WHERE comment_id = c.id
                GROUP BY emoji
            ) r
        ),
        '[]'::json
    ) AS reactions
FROM task_comments c
LEFT JOIN users u ON c.user_id = u.id
WHERE c.deleted_at IS NULL;
