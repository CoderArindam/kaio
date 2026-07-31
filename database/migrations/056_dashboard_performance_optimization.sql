-- 056_dashboard_performance_optimization.sql
-- Consolidates dashboard data: adds top_members to board summaries,
-- creates v_dashboard_recent_meetings_canonical for the aggregated endpoint.

-- 1. Rebuild v_dashboard_board_summaries_canonical with top_members JSON array
DROP VIEW IF EXISTS v_dashboard_board_summaries_canonical CASCADE;
CREATE OR REPLACE VIEW v_dashboard_board_summaries_canonical AS
SELECT
    b.id,
    b.id AS board_id,
    b.organization_id,
    b.name,
    b.name AS board_name,
    b.project_key,
    b.description,
    b.icon,
    b.color,
    b.cover_gradient,
    b.created_at,
    (SELECT COUNT(*) FROM board_members WHERE board_id = b.id) AS member_count,
    COALESCE(t_summary.task_count, 0) AS task_count,
    COALESCE(t_summary.completed_task_count, 0) AS completed_task_count,
    CASE
        WHEN COALESCE(t_summary.task_count, 0) > 0
        THEN ROUND((COALESCE(t_summary.completed_task_count, 0)::numeric / t_summary.task_count::numeric) * 100.0, 1)::float
        ELSE 0.0
    END AS completion_percentage,
    COALESCE(t_summary.overdue_count, 0) AS overdue_count,
    -- Top 5 board members as a JSON array for avatar display (eliminates N+1 fetches)
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'user_id', u.id,
                    'first_name', u.first_name,
                    'last_name', u.last_name,
                    'email', u.email,
                    'avatar_url', u.avatar_url,
                    'permission', bm_sub.permission
                )
            )
            FROM (
                SELECT bm3.user_id, bm3.permission
                FROM board_members bm3
                WHERE bm3.board_id = b.id
                ORDER BY bm3.created_at ASC
                LIMIT 5
            ) bm_sub
            JOIN users u ON u.id = bm_sub.user_id
            WHERE u.deleted_at IS NULL
        ),
        '[]'::json
    ) AS top_members
FROM boards b
LEFT JOIN (
    SELECT
        t.board_id,
        COUNT(t.id) AS task_count,
        COUNT(t.id) FILTER (WHERE c.column_type = 'DONE') AS completed_task_count,
        COUNT(t.id) FILTER (WHERE t.due_date < CURRENT_TIMESTAMP AND c.column_type != 'DONE') AS overdue_count
    FROM tasks t
    JOIN board_columns c ON t.column_id = c.id
    WHERE t.deleted_at IS NULL
    GROUP BY t.board_id
) t_summary ON b.id = t_summary.board_id
WHERE b.deleted_at IS NULL;


-- 2. Create v_dashboard_recent_meetings_canonical (last 10 sessions per org)
-- Used by the consolidated /dashboard/summary endpoint, eliminates separate /meeting/sessions call.
DROP VIEW IF EXISTS v_dashboard_recent_meetings_canonical CASCADE;
CREATE OR REPLACE VIEW v_dashboard_recent_meetings_canonical AS
SELECT
    ms.id,
    ms.session_id,
    ms.org_id,
    ms.meeting_url,
    ms.status,
    ms.source,
    ms.calendar_event_id,
    ms.scheduled_start_time,
    ms.started_at,
    ms.created_at,
    ms.initiated_by_user_id,
    iu.email AS initiator_email,
    CASE
        WHEN iu.first_name IS NOT NULL OR iu.last_name IS NOT NULL
        THEN TRIM(CONCAT(iu.first_name, ' ', iu.last_name))
        ELSE iu.email
    END AS initiator_display_name,
    iu.avatar_url AS initiator_avatar_url
FROM meeting_sessions ms
LEFT JOIN users iu ON ms.initiated_by_user_id = iu.id;
