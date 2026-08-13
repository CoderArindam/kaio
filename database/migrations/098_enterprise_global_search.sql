-- 100_enterprise_global_search.sql
-- Enterprise Global Search Function with deeply integrated RBAC

CREATE OR REPLACE FUNCTION fn_global_search(
    p_user_id INTEGER,
    p_org_id INTEGER,
    p_query TEXT,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id INTEGER,
    title TEXT,
    type TEXT,
    board_id INTEGER,
    task_id INTEGER,
    org_id INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.id, 
        v.title, 
        v.type, 
        v.board_id, 
        v.task_id, 
        v.org_id
    FROM v_global_search_canonical v
    WHERE v.org_id = p_org_id
      AND can_view_board(p_user_id, v.board_id)
      AND (
          v.search_vector @@ plainto_tsquery('english', p_query)
          OR v.title ILIKE '%' || p_query || '%'
      )
    ORDER BY ts_rank(v.search_vector, plainto_tsquery('english', p_query)) DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
