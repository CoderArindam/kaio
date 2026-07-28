-- 049_meeting_session_fail_status.sql
-- Add failed_at column to meeting_sessions and fn_fail_meeting_session stored procedure

ALTER TABLE meeting_sessions 
ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ NULL;

CREATE OR REPLACE FUNCTION fn_fail_meeting_session(
    p_session_id VARCHAR
)
RETURNS void AS $$
BEGIN
    UPDATE meeting_sessions
    SET status = 'FAILED',
        failed_at = NOW()
    WHERE session_id = p_session_id
       OR id::text = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
