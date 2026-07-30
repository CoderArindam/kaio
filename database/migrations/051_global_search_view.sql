-- 051_global_search_view.sql
-- Global Search Canonical View supporting full-text search across Tasks, Boards, and Comments

CREATE OR REPLACE VIEW v_global_search_canonical AS
SELECT 
    t.id AS id,
    (b.project_key || '-' || t.project_sequence_id || ' ' || t.title) AS title,
    'task'::text AS type,
    t.board_id AS board_id,
    t.id AS task_id,
    b.organization_id AS org_id,
    to_tsvector('english', coalesce(b.project_key, '') || ' ' || coalesce(t.title, '') || ' ' || coalesce(t.description, '')) AS search_vector
FROM tasks t
JOIN boards b ON t.board_id = b.id
WHERE t.deleted_at IS NULL AND b.deleted_at IS NULL

UNION ALL

SELECT 
    b.id AS id,
    (b.project_key || ' - ' || b.name) AS title,
    'board'::text AS type,
    b.id AS board_id,
    NULL::integer AS task_id,
    b.organization_id AS org_id,
    to_tsvector('english', coalesce(b.project_key, '') || ' ' || coalesce(b.name, '')) AS search_vector
FROM boards b
WHERE b.deleted_at IS NULL

UNION ALL

SELECT 
    c.id AS id,
    c.content AS title,
    'comment'::text AS type,
    t.board_id AS board_id,
    c.task_id AS task_id,
    b.organization_id AS org_id,
    to_tsvector('english', coalesce(c.content, '')) AS search_vector
FROM task_comments c
JOIN tasks t ON c.task_id = t.id
JOIN boards b ON t.board_id = b.id
WHERE c.deleted_at IS NULL AND t.deleted_at IS NULL AND b.deleted_at IS NULL;
