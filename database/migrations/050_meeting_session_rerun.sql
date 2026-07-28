-- 050_meeting_session_rerun.sql
-- Stored function to reset meeting session status to PROCESSING and clear failed_at

CREATE OR REPLACE FUNCTION fn_reset_meeting_session_status(
    p_session_id VARCHAR
)
RETURNS void AS $$
BEGIN
    UPDATE meeting_sessions
    SET status = 'PROCESSING',
        failed_at = NULL
    WHERE session_id = p_session_id
       OR id::text = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
