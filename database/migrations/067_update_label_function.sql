-- 067_update_label_function.sql
-- Function to update label name and color safely with board access check

CREATE OR REPLACE FUNCTION fn_update_label(
    p_label_id INTEGER,
    p_name TEXT DEFAULT NULL,
    p_color TEXT DEFAULT NULL,
    p_user_id INTEGER DEFAULT NULL
) RETURNS TABLE(id INTEGER, board_id INTEGER, name VARCHAR, color VARCHAR, created_at TIMESTAMP WITH TIME ZONE) AS $$
DECLARE
    v_board_id INTEGER;
BEGIN
    SELECT l.board_id INTO v_board_id FROM labels l WHERE l.id = p_label_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Label not found: %', p_label_id;
    END IF;

    IF p_user_id IS NOT NULL AND NOT fn_check_board_access(p_user_id, v_board_id, 'EDIT') THEN
        RAISE EXCEPTION 'Access denied: Insufficient permissions to update label %', p_label_id;
    END IF;

    RETURN QUERY
    UPDATE labels
    SET name = COALESCE(NULLIF(TRIM(p_name), ''), labels.name),
        color = COALESCE(NULLIF(TRIM(p_color), ''), labels.color)
    WHERE labels.id = p_label_id
    RETURNING labels.id, labels.board_id, labels.name, labels.color, labels.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
