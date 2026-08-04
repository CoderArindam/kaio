-- 071_account_hard_delete.sql
-- Hard delete a user account and all associated data atomically.
-- Password verification is done in Python before calling this function.
-- Returns (success, error_code) so the caller can distinguish guard failures.

CREATE OR REPLACE FUNCTION fn_hard_delete_account(
    p_user_id INTEGER
)
RETURNS TABLE(success BOOLEAN, error_code TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_org_id       INTEGER;
    v_user_role    TEXT;
    v_admin_count  INTEGER;
BEGIN
    -- Lock the user row to prevent concurrent deletion races.
    -- If two requests arrive simultaneously, the second will find NOT FOUND
    -- after the first commits the DELETE.
    SELECT organization_id, role
      INTO v_org_id, v_user_role
      FROM users
     WHERE id = p_user_id
       AND deleted_at IS NULL
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'USER_NOT_FOUND'::TEXT;
        RETURN;
    END IF;

    -- Guard: block if this user is the only SUPER_ADMIN in the org.
    -- Deleting them would orphan the organization with no administrator.
    IF v_user_role = 'SUPER_ADMIN' THEN
        SELECT COUNT(*)
          INTO v_admin_count
          FROM users
         WHERE organization_id = v_org_id
           AND role = 'SUPER_ADMIN'
           AND deleted_at IS NULL;

        IF v_admin_count <= 1 THEN
            RETURN QUERY SELECT FALSE, 'LAST_ADMIN'::TEXT;
            RETURN;
        END IF;
    END IF;

    -- --------------------------------------------------------
    -- Delete in safe dependency order. Tables with ON DELETE CASCADE
    -- on users(id) will handle themselves, but we explicitly delete
    -- token / session tables to be safe and avoid any residual data.
    -- --------------------------------------------------------

    -- OTP codes (FK: ON DELETE CASCADE, but explicit for safety)
    DELETE FROM otp_codes WHERE user_id = p_user_id;

    -- Auth tokens (FK: ON DELETE CASCADE)
    DELETE FROM password_reset_tokens WHERE user_id = p_user_id;
    DELETE FROM email_verification_tokens WHERE user_id = p_user_id;

    -- Sessions (FK: ON DELETE CASCADE via user_sessions)
    DELETE FROM user_sessions WHERE user_id = p_user_id;

    -- Audit log rows authored by this user — SET NULL via FK already,
    -- but security_events (audit_logs) authored by user: keep org records,
    -- just null out the user_id (handled by ON DELETE SET NULL on FK).

    -- User preferences (FK: ON DELETE CASCADE)
    DELETE FROM user_preferences WHERE user_id = p_user_id;

    -- Notifications (FK: ON DELETE CASCADE)
    DELETE FROM notifications WHERE user_id = p_user_id;

    -- Comment mentions where this user was mentioned
    DELETE FROM comment_mentions WHERE user_id = p_user_id;

    -- Board memberships (FK: ON DELETE CASCADE)
    DELETE FROM board_members WHERE user_id = p_user_id;

    -- Timesheet approver assignments (UUID-based, no FK to users(id)).
    -- Match by casting p_user_id to text and comparing with stored UUID string.
    -- These are stored as TEXT UUIDs in a separate schema; delete where possible.
    DELETE FROM timesheet_approver_assignments
     WHERE approver_user_id::TEXT = p_user_id::TEXT;

    -- Null out task references so tasks (org assets) remain intact
    UPDATE tasks SET assigned_to = NULL WHERE assigned_to = p_user_id;
    UPDATE tasks SET created_by  = NULL WHERE created_by  = p_user_id;

    -- Hard delete the user row. All remaining CASCADE children will follow.
    DELETE FROM users WHERE id = p_user_id;

    RETURN QUERY SELECT TRUE, NULL::TEXT;

EXCEPTION
    WHEN OTHERS THEN
        -- Re-raise so the caller's transaction rolls back cleanly.
        RAISE;
END;
$$;
