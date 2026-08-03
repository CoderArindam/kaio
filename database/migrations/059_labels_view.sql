-- 059_labels_view.sql
-- Canonical views for labels and updated v_tasks_canonical with aggregated labels

CREATE OR REPLACE VIEW v_labels_canonical AS
SELECT
    id,
    board_id,
    name,
    color,
    created_at
FROM labels;


CREATE OR REPLACE VIEW v_task_labels_canonical AS
SELECT
    tl.task_id,
    l.id AS label_id,
    l.board_id,
    l.name,
    l.color,
    l.created_at
FROM task_labels tl
JOIN labels l ON tl.label_id = l.id;


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
    ) AS labels

FROM tasks t
JOIN boards b ON t.board_id = b.id
JOIN board_columns c ON t.column_id = c.id
LEFT JOIN users au ON t.assigned_to = au.id
LEFT JOIN users cu ON t.created_by = cu.id
WHERE t.deleted_at IS NULL
  AND b.deleted_at IS NULL;
