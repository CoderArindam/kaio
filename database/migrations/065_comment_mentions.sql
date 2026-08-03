-- 065_comment_mentions.sql
-- Add comment mentions junction table and mention notification stored procedure

-- 1. Add MENTIONED_IN_COMMENT and COMMENT_REPLIED to activity_type_enum if not already present
ALTER TYPE activity_type_enum ADD VALUE IF NOT EXISTS 'MENTIONED_IN_COMMENT';
ALTER TYPE activity_type_enum ADD VALUE IF NOT EXISTS 'COMMENT_REPLIED';

-- 2. Create comment_mentions junction table
CREATE TABLE IF NOT EXISTS comment_mentions (
    id SERIAL PRIMARY KEY,
    comment_id INTEGER NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_comment_mention UNIQUE(comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_mentions_comment_id ON comment_mentions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_mentions_user_id ON comment_mentions(user_id);

-- 3. Stored procedure fn_create_comment_mentions
CREATE OR REPLACE FUNCTION fn_create_comment_mentions(
    p_comment_id INTEGER,
    p_mentioned_user_ids INTEGER[],
    p_actor_id INTEGER
) RETURNS INTEGER[] AS $$
DECLARE
    v_task_id INTEGER;
    v_org_id INTEGER;
    v_user_id INTEGER;
    v_activity_id INTEGER;
    v_parent_user_id INTEGER;
    v_notified_user_ids INTEGER[] := ARRAY[]::INTEGER[];
BEGIN
    SELECT c.task_id, b.organization_id, pc.user_id 
    INTO v_task_id, v_org_id, v_parent_user_id
    FROM task_comments c
    JOIN tasks t ON c.task_id = t.id
    JOIN boards b ON t.board_id = b.id
    LEFT JOIN task_comments pc ON c.parent_comment_id = pc.id AND pc.deleted_at IS NULL
    WHERE c.id = p_comment_id AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comment not found';
    END IF;

    IF p_mentioned_user_ids IS NULL OR array_length(p_mentioned_user_ids, 1) IS NULL THEN
        RETURN v_notified_user_ids;
    END IF;

    FOREACH v_user_id IN ARRAY p_mentioned_user_ids LOOP
        IF v_user_id IS NOT NULL AND v_user_id != COALESCE(p_actor_id, -1) THEN
            -- Insert into comment_mentions junction table
            INSERT INTO comment_mentions (comment_id, user_id)
            VALUES (p_comment_id, v_user_id)
            ON CONFLICT (comment_id, user_id) DO NOTHING;

            -- Avoid duplicate notification if user was already notified as parent comment author
            IF v_parent_user_id IS NULL OR v_user_id != v_parent_user_id THEN
                -- Create activity
                INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value)
                VALUES (
                    v_org_id, 'COMMENT', v_task_id, p_actor_id, 'MENTIONED_IN_COMMENT',
                    jsonb_build_object('comment_id', p_comment_id, 'mentioned_user_id', v_user_id)
                )
                RETURNING id INTO v_activity_id;

                -- Create notification for mentioned user
                INSERT INTO notifications (user_id, activity_id, is_read)
                VALUES (v_user_id, v_activity_id, false);

                v_notified_user_ids := array_append(v_notified_user_ids, v_user_id);
            END IF;
        END IF;
    END LOOP;

    RETURN v_notified_user_ids;
END;
$$ LANGUAGE plpgsql;

-- 3.5 Stored procedure fn_create_comment with reply notification
CREATE OR REPLACE FUNCTION fn_create_comment(
    p_task_id INTEGER,
    p_user_id INTEGER,
    p_parent_comment_id INTEGER,
    p_content TEXT,
    p_org_id INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_comment_id INTEGER;
    v_activity_id INTEGER;
    v_parent_user_id INTEGER;
    v_root_user_id INTEGER;
    v_curr_parent_id INTEGER;
    v_curr_comment_id INTEGER;
    v_reply_activity_id INTEGER;
BEGIN
    INSERT INTO task_comments (task_id, user_id, parent_comment_id, content)
    VALUES (p_task_id, p_user_id, p_parent_comment_id, p_content)
    RETURNING id INTO v_comment_id;

    INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value)
    VALUES (p_org_id, 'COMMENT', p_task_id, p_user_id, 'COMMENT_ADDED', jsonb_build_object('content', p_content, 'comment_id', v_comment_id))
    RETURNING id INTO v_activity_id;

    IF p_parent_comment_id IS NOT NULL THEN
        -- 1. Find immediate parent comment author
        SELECT user_id INTO v_parent_user_id
        FROM task_comments
        WHERE id = p_parent_comment_id AND deleted_at IS NULL;

        -- 2. Find root comment author of the thread
        v_curr_comment_id := p_parent_comment_id;
        LOOP
            SELECT parent_comment_id, user_id INTO v_curr_parent_id, v_root_user_id
            FROM task_comments
            WHERE id = v_curr_comment_id AND deleted_at IS NULL;

            EXIT WHEN v_curr_parent_id IS NULL OR NOT FOUND;
            v_curr_comment_id := v_curr_parent_id;
        END LOOP;

        -- Notify immediate parent comment author if not actor
        IF v_parent_user_id IS NOT NULL AND v_parent_user_id != p_user_id THEN
            INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value)
            VALUES (
                p_org_id, 'COMMENT', p_task_id, p_user_id, 'COMMENT_REPLIED',
                jsonb_build_object('comment_id', v_comment_id, 'parent_comment_id', p_parent_comment_id, 'parent_user_id', v_parent_user_id)
            )
            RETURNING id INTO v_reply_activity_id;

            INSERT INTO notifications (user_id, activity_id, is_read)
            VALUES (v_parent_user_id, v_reply_activity_id, false);
        END IF;

        -- Notify thread root author if different from actor and immediate parent
        IF v_root_user_id IS NOT NULL AND v_root_user_id != p_user_id AND v_root_user_id != COALESCE(v_parent_user_id, -1) THEN
            INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value)
            VALUES (
                p_org_id, 'COMMENT', p_task_id, p_user_id, 'COMMENT_REPLIED',
                jsonb_build_object('comment_id', v_comment_id, 'parent_comment_id', p_parent_comment_id, 'parent_user_id', v_root_user_id)
            )
            RETURNING id INTO v_reply_activity_id;

            INSERT INTO notifications (user_id, activity_id, is_read)
            VALUES (v_root_user_id, v_reply_activity_id, false);
        END IF;
    END IF;

    RETURN v_comment_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Update v_board_members_canonical to include assigned members, owners, and organization SUPER_ADMIN users
DROP VIEW IF EXISTS v_board_members_canonical CASCADE;
CREATE VIEW v_board_members_canonical AS
SELECT 
    bm.board_id,
    u.id, 
    u.email, 
    u.first_name, 
    u.last_name, 
    u.avatar_url, 
    bm.created_at as joined_at
FROM board_members bm
JOIN users u ON bm.user_id = u.id
WHERE u.deleted_at IS NULL

UNION

SELECT 
    b.id as board_id,
    u.id, 
    u.email, 
    u.first_name, 
    u.last_name, 
    u.avatar_url, 
    b.created_at as joined_at
FROM boards b
JOIN users u ON b.owner_id = u.id
WHERE u.deleted_at IS NULL

UNION

SELECT 
    b.id as board_id,
    u.id, 
    u.email, 
    u.first_name, 
    u.last_name, 
    u.avatar_url, 
    u.created_at as joined_at
FROM boards b
JOIN users u ON u.organization_id = b.organization_id AND u.role = 'SUPER_ADMIN'
WHERE u.deleted_at IS NULL;
