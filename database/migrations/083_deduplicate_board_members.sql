-- 1. Recreate v_board_members_canonical with deduplication
CREATE OR REPLACE VIEW v_board_members_canonical AS
SELECT 
    board_id,
    u.id, 
    u.email, 
    u.first_name, 
    u.last_name, 
    u.avatar_url, 
    MIN(joined_at) as joined_at
FROM (
    SELECT bm.board_id, bm.user_id, bm.created_at as joined_at 
    FROM board_members bm
    
    UNION ALL
    
    SELECT b.id as board_id, b.owner_id as user_id, b.created_at as joined_at 
    FROM boards b
    
    UNION ALL
    
    SELECT b.id as board_id, u.id as user_id, u.created_at as joined_at 
    FROM boards b
    JOIN users u ON u.organization_id = b.organization_id AND u.role = 'SUPER_ADMIN'
) all_members
JOIN users u ON all_members.user_id = u.id
WHERE u.deleted_at IS NULL
GROUP BY board_id, u.id, u.email, u.first_name, u.last_name, u.avatar_url;
