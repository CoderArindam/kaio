-- 062_subtasks_view.sql
-- Canonical view for subtasks and updated v_tasks_canonical with subtask count aggregates

CREATE OR REPLACE VIEW v_subtasks_canonical AS
SELECT
    s.id,
    s.task_id,
    s.title,
    s.is_completed,
    s."position",
    s.created_by,
    COALESCE(
        NULLIF(TRIM(COALESCE(cu.first_name, '') || ' ' || COALESCE(cu.last_name, '')), ''),
        cu.email,
        ''
    ) AS creator_name,
    s.created_at
FROM subtasks s
LEFT JOIN users cu ON s.created_by = cu.id
WHERE s.deleted_at IS NULL;


CREATE OR REPLACE VIEW v_tasks_canonical AS
SELECT
    t.id,
    t.board_id,
    b.name AS board_name,
    b.organization_id,
    (b.project_key || '-' || t.project_sequence_id) AS task_reference,
    t.column_id,
    c.name AS column_name,
    c.column_type,
    (c.column_type = 'DONE') AS is_completed,
    t.title,
    t.description,
    t.priority,
    t.due_date,
    t.reminder_at,
    t.completed_at,
    t.created_at,
    t.updated_at,
    
    -- Assignee Info
    t.assigned_to,
    au.email AS assignee_email,
    au.first_name AS assignee_first_name,
    au.last_name AS assignee_last_name,
    au.avatar_url AS assignee_avatar_url,
    
    -- Creator Info
    t.created_by,
    cu.email AS creator_email,
    cu.first_name AS creator_first_name,
    cu.last_name AS creator_last_name,
    cu.avatar_url AS creator_avatar_url,

    -- Aggregated Labels JSON array
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'id', l.id,
                    'board_id', l.board_id,
                    'name', l.name,
                    'color', l.color,
                    'created_at', l.created_at
                ) ORDER BY l.name ASC
            )
            FROM task_labels tl
            JOIN labels l ON tl.label_id = l.id
            WHERE tl.task_id = t.id
        ),
        '[]'::json
    ) AS labels,

    -- Subtask Aggregates
    COALESCE(
        (SELECT COUNT(*)::INTEGER FROM subtasks st WHERE st.task_id = t.id AND st.deleted_at IS NULL),
        0
    ) AS subtask_count,
    COALESCE(
        (SELECT COUNT(*)::INTEGER FROM subtasks st WHERE st.task_id = t.id AND st.is_completed = TRUE AND st.deleted_at IS NULL),
        0
    ) AS completed_subtask_count

FROM tasks t
JOIN boards b ON t.board_id = b.id
JOIN board_columns c ON t.column_id = c.id
LEFT JOIN users au ON t.assigned_to = au.id
LEFT JOIN users cu ON t.created_by = cu.id
WHERE t.deleted_at IS NULL
  AND b.deleted_at IS NULL;
