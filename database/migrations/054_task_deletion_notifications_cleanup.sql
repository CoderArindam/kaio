-- 054_task_deletion_notifications_cleanup.sql
-- Function to handle atomic task deletion and cleanup of associated notifications and comments
-- Enhances v_activities_canonical and v_notifications_canonical to strictly filter out notifications for soft-deleted tasks/comments

DROP FUNCTION IF EXISTS fn_delete_task(INT, INT);

CREATE OR REPLACE FUNCTION fn_delete_task(
    p_task_id INT,
    p_user_id INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_board_id INT;
    v_user_role VARCHAR;
    v_has_access BOOLEAN;
BEGIN
    -- 1. Check if task exists and is not already deleted
    SELECT board_id INTO v_board_id
    FROM tasks
    WHERE id = p_task_id AND deleted_at IS NULL;

    IF v_board_id IS NULL THEN
        RAISE EXCEPTION 'Task not found or already deleted' USING ERRCODE = 'P0002';
    END IF;

    -- 2. Verify permission (Must be MANAGER or SUPER_ADMIN in the user's organization)
    SELECT role INTO v_user_role
    FROM users
    WHERE id = p_user_id AND deleted_at IS NULL;

    IF v_user_role NOT IN ('MANAGER', 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'Only MANAGER or SUPER_ADMIN can delete tasks' USING ERRCODE = '42501';
    END IF;

    -- 3. Verify board access
    SELECT can_edit_board(p_user_id, v_board_id) INTO v_has_access;
    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Access denied to board' USING ERRCODE = '42501';
    END IF;

    -- 4. Soft-delete the task
    UPDATE tasks
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = p_task_id AND deleted_at IS NULL;

    -- 5. Soft-delete all task_comments associated with the task
    UPDATE task_comments
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE task_id = p_task_id AND deleted_at IS NULL;

    -- 6. Delete all notifications associated with activities for this task or its comments
    DELETE FROM notifications
    WHERE activity_id IN (
        SELECT id FROM activities
        WHERE entity_type IN ('TASK', 'COMMENT') AND entity_id = p_task_id
    );

    RETURN TRUE;
END;
$$;

-- 7. Update canonical views to exclude soft-deleted tasks/comments from activity and notification feeds

DROP VIEW IF EXISTS v_notifications_canonical CASCADE;
DROP VIEW IF EXISTS v_activities_canonical CASCADE;

CREATE VIEW v_activities_canonical AS
SELECT
    a.id,
    a.organization_id,
    a.entity_type,
    a.entity_id,
    a.activity_type,
    a.old_value,
    a.new_value,
    a.metadata,
    a.created_at,
    
    -- Actor Info
    a.user_id AS actor_id,
    u.first_name AS actor_first_name,
    u.last_name AS actor_last_name,
    u.avatar_url AS actor_avatar_url,
    u.email AS actor_email,
    
    -- Target Reference (e.g. ENG-24 Fix Auth Service)
    CASE 
        WHEN a.entity_type IN ('TASK', 'COMMENT') THEN (
            SELECT (b.project_key || '-' || t.project_sequence_id || ' ' || t.title) 
            FROM tasks t 
            JOIN boards b ON t.board_id = b.id 
            WHERE t.id = a.entity_id AND t.deleted_at IS NULL
        )
        WHEN a.entity_type = 'BOARD' THEN (
            SELECT project_key FROM boards WHERE id = a.entity_id AND deleted_at IS NULL
        )
        ELSE NULL
    END AS target_reference,

    -- Target Board ID for navigation
    CASE 
        WHEN a.entity_type IN ('TASK', 'COMMENT') THEN (
            SELECT board_id FROM tasks WHERE id = a.entity_id AND deleted_at IS NULL
        )
        WHEN a.entity_type = 'BOARD' THEN a.entity_id
        ELSE NULL
    END AS target_board_id

FROM activities a
LEFT JOIN users u ON a.user_id = u.id
WHERE 
    (a.entity_type IN ('TASK', 'COMMENT') AND EXISTS (SELECT 1 FROM tasks t WHERE t.id = a.entity_id AND t.deleted_at IS NULL))
    OR (a.entity_type = 'BOARD' AND EXISTS (SELECT 1 FROM boards b WHERE b.id = a.entity_id AND b.deleted_at IS NULL))
    OR (a.entity_type NOT IN ('TASK', 'COMMENT', 'BOARD'));


CREATE VIEW v_notifications_canonical AS
SELECT
    n.id,
    n.user_id,
    n.is_read,
    n.created_at,
    
    -- Embedded Activity
    a.id AS activity_id,
    a.entity_type AS activity_entity_type,
    a.entity_id AS activity_entity_id,
    a.activity_type,
    a.old_value AS activity_old_value,
    a.new_value AS activity_new_value,
    a.target_reference AS activity_target_reference,
    a.target_board_id AS activity_target_board_id,
    a.actor_first_name AS activity_actor_first_name,
    a.actor_last_name AS activity_actor_last_name,
    a.actor_avatar_url AS activity_actor_avatar_url

FROM notifications n
JOIN v_activities_canonical a ON n.activity_id = a.id;
