-- 086_explicit_comment_reactions.sql
-- Add explicit add and remove functions for comment reactions instead of toggle

CREATE OR REPLACE FUNCTION fn_add_comment_reaction(
    p_comment_id INTEGER,
    p_user_id INTEGER,
    p_emoji TEXT
) RETURNS BOOLEAN AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM task_comments WHERE id = p_comment_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Comment not found';
    END IF;

    INSERT INTO comment_reactions (comment_id, user_id, emoji)
    VALUES (p_comment_id, p_user_id, p_emoji)
    ON CONFLICT (comment_id, user_id, emoji) DO NOTHING;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION fn_remove_comment_reaction(
    p_comment_id INTEGER,
    p_user_id INTEGER,
    p_emoji TEXT
) RETURNS BOOLEAN AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM task_comments WHERE id = p_comment_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Comment not found';
    END IF;

    DELETE FROM comment_reactions
    WHERE comment_id = p_comment_id AND user_id = p_user_id AND emoji = p_emoji;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
