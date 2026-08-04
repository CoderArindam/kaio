-- 073_organization_deletion.sql

-- 1. Organizations Status Modifications
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DELETING', 'PURGING', 'DELETED')),
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_requested_by INT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS deletion_scheduled_purge_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ;

-- 2. Deletion Jobs Tracking
CREATE TABLE IF NOT EXISTS organization_deletion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id INT NOT NULL REFERENCES organizations(id),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED')),
    current_phase TEXT,
    progress JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Platform Audit Log (Non-Cascading)
CREATE TABLE IF NOT EXISTS platform_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    organization_id_snapshot INT,
    organization_name_snapshot TEXT NOT NULL,
    actor_user_id_snapshot INT,
    actor_email_snapshot TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Guard Stored Procedure
CREATE OR REPLACE FUNCTION fn_check_organization_active(p_org_id INT)
RETURNS BOOLEAN AS $$
DECLARE
    v_status VARCHAR;
BEGIN
    SELECT status INTO v_status FROM organizations WHERE id = p_org_id;
    IF v_status IS NULL OR v_status != 'ACTIVE' THEN
        RETURN FALSE;
    END IF;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 5. Initiate Organization Deletion
CREATE OR REPLACE FUNCTION fn_initiate_organization_deletion(
    p_org_id INT,
    p_actor_user_id INT,
    p_org_name_confirmation TEXT,
    p_grace_period_hours INT
) RETURNS INT AS $$
DECLARE
    v_org_id INT;
    v_actual_name TEXT;
    v_actor_email TEXT;
BEGIN
    -- Verify exact name match
    SELECT name INTO v_actual_name FROM organizations WHERE id = p_org_id;
    IF v_actual_name != p_org_name_confirmation THEN
        RAISE EXCEPTION 'ORGANIZATION_NAME_MISMATCH';
    END IF;

    -- Verify actor is Super Admin
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_actor_user_id AND organization_id = p_org_id AND role = 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT email INTO v_actor_email FROM users WHERE id = p_actor_user_id;

    -- CAS Update
    UPDATE organizations
    SET status = 'DELETING',
        deletion_requested_at = NOW(),
        deletion_requested_by = p_actor_user_id,
        deletion_scheduled_purge_at = NOW() + (p_grace_period_hours || ' hours')::interval
    WHERE id = p_org_id AND status = 'ACTIVE'
    RETURNING id INTO v_org_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'DELETION_ALREADY_IN_PROGRESS';
    END IF;

    -- Create Pending Job
    INSERT INTO organization_deletion_jobs (organization_id, status)
    VALUES (p_org_id, 'PENDING');

    -- Revoke all active sessions for the org
    UPDATE user_sessions
    SET revoked_at = NOW()
    WHERE user_id IN (SELECT id FROM users WHERE organization_id = p_org_id);

    -- Log to platform audit log
    INSERT INTO platform_audit_log (
        event_type, organization_id_snapshot, organization_name_snapshot,
        actor_user_id_snapshot, actor_email_snapshot, metadata
    )
    VALUES (
        'ORGANIZATION_DELETION_INITIATED', p_org_id, v_actual_name,
        p_actor_user_id, v_actor_email, jsonb_build_object('grace_period_hours', p_grace_period_hours)
    );

    RETURN v_org_id;
END;
$$ LANGUAGE plpgsql;

-- 6. Cancel Organization Deletion
CREATE OR REPLACE FUNCTION fn_cancel_organization_deletion(
    p_org_id INT,
    p_actor_user_id INT
) RETURNS VOID AS $$
DECLARE
    v_org_id INT;
    v_actual_name TEXT;
    v_actor_email TEXT;
BEGIN
    -- Verify actor is Super Admin
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_actor_user_id AND organization_id = p_org_id AND role = 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT name INTO v_actual_name FROM organizations WHERE id = p_org_id;
    SELECT email INTO v_actor_email FROM users WHERE id = p_actor_user_id;

    -- CAS Update
    UPDATE organizations
    SET status = 'ACTIVE',
        deletion_requested_at = NULL,
        deletion_requested_by = NULL,
        deletion_scheduled_purge_at = NULL
    WHERE id = p_org_id AND status = 'DELETING'
    RETURNING id INTO v_org_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'CANNOT_CANCEL_DELETION';
    END IF;

    -- Cancel pending job
    UPDATE organization_deletion_jobs
    SET status = 'FAILED', last_error = 'CANCELLED'
    WHERE organization_id = p_org_id AND status = 'PENDING';

    -- Log to platform audit log
    INSERT INTO platform_audit_log (
        event_type, organization_id_snapshot, organization_name_snapshot,
        actor_user_id_snapshot, actor_email_snapshot
    )
    VALUES (
        'ORGANIZATION_DELETION_CANCELLED', p_org_id, v_actual_name,
        p_actor_user_id, v_actor_email
    );
END;
$$ LANGUAGE plpgsql;

-- 7. Claim Purge Job
CREATE OR REPLACE FUNCTION fn_claim_organization_purge_job(
    p_org_id INT
) RETURNS UUID AS $$
DECLARE
    v_job_id UUID;
    v_org_id INT;
BEGIN
    -- CAS Update on organization
    UPDATE organizations
    SET status = 'PURGING'
    WHERE id = p_org_id AND status = 'DELETING' AND deletion_scheduled_purge_at <= NOW()
    RETURNING id INTO v_org_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'ORGANIZATION_NOT_READY_FOR_PURGE';
    END IF;

    -- CAS Update on job
    UPDATE organization_deletion_jobs
    SET status = 'RUNNING', started_at = NOW(), updated_at = NOW()
    WHERE organization_id = p_org_id AND status = 'PENDING'
    RETURNING id INTO v_job_id;

    IF v_job_id IS NULL THEN
        -- Revert org status if job claim fails somehow
        UPDATE organizations SET status = 'DELETING' WHERE id = p_org_id;
        RAISE EXCEPTION 'NO_PENDING_JOB';
    END IF;

    RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

-- 8. Purge Organization Batch
CREATE OR REPLACE FUNCTION fn_purge_organization_batch(
    p_org_id INT,
    p_table_name TEXT,
    p_batch_size INT
) RETURNS INT AS $$
DECLARE
    v_deleted_count INT := 0;
BEGIN
    IF p_table_name = 'comment_mentions' THEN
        WITH deleted AS (
            DELETE FROM comment_mentions
            WHERE comment_id IN (
                SELECT id FROM task_comments WHERE task_id IN (
                    SELECT id FROM tasks WHERE board_id IN (
                        SELECT id FROM boards WHERE organization_id = p_org_id
                    )
                )
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;
        
    ELSIF p_table_name = 'task_comments' THEN
        WITH deleted AS (
            DELETE FROM task_comments
            WHERE id IN (
                SELECT id FROM task_comments
                WHERE task_id IN (
                    SELECT id FROM tasks WHERE board_id IN (
                        SELECT id FROM boards WHERE organization_id = p_org_id
                    )
                )
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;
        
    ELSIF p_table_name = 'subtasks' THEN
        WITH deleted AS (
            DELETE FROM subtasks
            WHERE id IN (
                SELECT id FROM subtasks
                WHERE task_id IN (
                    SELECT id FROM tasks WHERE board_id IN (
                        SELECT id FROM boards WHERE organization_id = p_org_id
                    )
                )
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;
        
    ELSIF p_table_name = 'task_labels' THEN
        WITH deleted AS (
            DELETE FROM task_labels
            WHERE task_id IN (
                SELECT id FROM tasks WHERE board_id IN (
                    SELECT id FROM boards WHERE organization_id = p_org_id
                )
                LIMIT p_batch_size
            )
            RETURNING task_id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;
        
    ELSIF p_table_name = 'task_attachments' THEN
        WITH deleted AS (
            DELETE FROM task_attachments
            WHERE id IN (
                SELECT id FROM task_attachments
                WHERE task_id IN (
                    SELECT id FROM tasks WHERE board_id IN (
                        SELECT id FROM boards WHERE organization_id = p_org_id
                    )
                )
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;
        
    ELSIF p_table_name = 'tasks' THEN
        WITH deleted AS (
            DELETE FROM tasks
            WHERE id IN (
                SELECT id FROM tasks WHERE board_id IN (
                    SELECT id FROM boards WHERE organization_id = p_org_id
                )
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;
        
    ELSIF p_table_name = 'labels' THEN
        WITH deleted AS (
            DELETE FROM labels
            WHERE id IN (
                SELECT id FROM labels WHERE board_id IN (
                    SELECT id FROM boards WHERE organization_id = p_org_id
                )
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;
        
    ELSIF p_table_name = 'board_columns' THEN
        WITH deleted AS (
            DELETE FROM board_columns
            WHERE id IN (
                SELECT id FROM board_columns WHERE board_id IN (
                    SELECT id FROM boards WHERE organization_id = p_org_id
                )
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;
        
    ELSIF p_table_name = 'board_members' THEN
        WITH deleted AS (
            DELETE FROM board_members
            WHERE id IN (
                SELECT id FROM board_members WHERE board_id IN (
                    SELECT id FROM boards WHERE organization_id = p_org_id
                )
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'project_settings' THEN
        WITH deleted AS (
            DELETE FROM project_settings
            WHERE id IN (
                SELECT id FROM project_settings WHERE board_id IN (
                    SELECT id FROM boards WHERE organization_id = p_org_id
                )
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'boards' THEN
        WITH deleted AS (
            DELETE FROM boards
            WHERE id IN (
                SELECT id FROM boards WHERE organization_id = p_org_id
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'task_proposals' THEN
        WITH deleted AS (
            DELETE FROM task_proposals
            WHERE id IN (
                SELECT id FROM task_proposals WHERE meeting_session_id IN (
                    SELECT id FROM meeting_sessions WHERE org_id = p_org_id
                )
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'meeting_sessions' THEN
        WITH deleted AS (
            DELETE FROM meeting_sessions
            WHERE id IN (
                SELECT id FROM meeting_sessions WHERE org_id = p_org_id
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'timesheet_audit_logs' THEN
        WITH deleted AS (
            DELETE FROM timesheet_audit_logs
            WHERE id IN (
                SELECT id FROM timesheet_audit_logs WHERE timesheet_id IN (
                    SELECT id FROM timesheets WHERE org_id = p_org_id
                )
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'timesheet_entries' THEN
        WITH deleted AS (
            DELETE FROM timesheet_entries
            WHERE id IN (
                SELECT id FROM timesheet_entries WHERE timesheet_id IN (
                    SELECT id FROM timesheets WHERE org_id = p_org_id
                )
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'timesheets' THEN
        WITH deleted AS (
            DELETE FROM timesheets
            WHERE id IN (
                SELECT id FROM timesheets WHERE org_id = p_org_id
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'timesheet_approver_assignments' THEN
        WITH deleted AS (
            DELETE FROM timesheet_approver_assignments
            WHERE id IN (
                SELECT id FROM timesheet_approver_assignments WHERE org_id = p_org_id
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'timesheet_policies' THEN
        WITH deleted AS (
            DELETE FROM timesheet_policies
            WHERE id IN (
                SELECT id FROM timesheet_policies WHERE org_id = p_org_id
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'notifications' THEN
        WITH deleted AS (
            DELETE FROM notifications
            WHERE id IN (
                SELECT id FROM notifications WHERE user_id IN (
                    SELECT id FROM users WHERE organization_id = p_org_id
                )
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'activities' THEN
        WITH deleted AS (
            DELETE FROM activities
            WHERE id IN (
                SELECT id FROM activities WHERE organization_id = p_org_id
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'security_events' THEN
        WITH deleted AS (
            DELETE FROM security_events
            WHERE id IN (
                SELECT id FROM security_events WHERE user_id IN (
                    SELECT id FROM users WHERE organization_id = p_org_id
                )
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'user_sessions' THEN
        WITH deleted AS (
            DELETE FROM user_sessions
            WHERE id IN (
                SELECT id FROM user_sessions WHERE user_id IN (
                    SELECT id FROM users WHERE organization_id = p_org_id
                )
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'user_preferences' THEN
        WITH deleted AS (
            DELETE FROM user_preferences
            WHERE id IN (
                SELECT id FROM user_preferences WHERE user_id IN (
                    SELECT id FROM users WHERE organization_id = p_org_id
                )
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'organization_invitations' THEN
        WITH deleted AS (
            DELETE FROM organization_invitations
            WHERE id IN (
                SELECT id FROM organization_invitations WHERE organization_id = p_org_id
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'organization_profile' THEN
        WITH deleted AS (
            DELETE FROM organization_profile
            WHERE id IN (
                SELECT id FROM organization_profile WHERE organization_id = p_org_id
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'password_reset_tokens' THEN
        WITH deleted AS (
            DELETE FROM password_reset_tokens
            WHERE id IN (
                SELECT id FROM password_reset_tokens WHERE user_id IN (
                    SELECT id FROM users WHERE organization_id = p_org_id
                )
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'email_verification_tokens' THEN
        WITH deleted AS (
            DELETE FROM email_verification_tokens
            WHERE id IN (
                SELECT id FROM email_verification_tokens WHERE user_id IN (
                    SELECT id FROM users WHERE organization_id = p_org_id
                )
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    ELSIF p_table_name = 'audit_logs' THEN
        WITH deleted AS (
            DELETE FROM audit_logs
            WHERE id IN (
                SELECT id FROM audit_logs WHERE organization_id = p_org_id
                LIMIT p_batch_size
            )
            RETURNING id
        ) SELECT count(*) INTO v_deleted_count FROM deleted;

    END IF;

    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 9. Finalize Organization Purge
CREATE OR REPLACE FUNCTION fn_finalize_organization_purge(
    p_org_id INT
) RETURNS VOID AS $$
DECLARE
    v_actual_name TEXT;
    v_actor_user_id INT;
BEGIN
    SELECT name, deletion_requested_by INTO v_actual_name, v_actor_user_id
    FROM organizations WHERE id = p_org_id;

    -- Delete users
    DELETE FROM users WHERE organization_id = p_org_id;
    
    -- Delete organization_deletion_jobs
    DELETE FROM organization_deletion_jobs WHERE organization_id = p_org_id;

    -- Delete organization itself
    DELETE FROM organizations WHERE id = p_org_id;

    -- Log final to platform_audit_log
    INSERT INTO platform_audit_log (
        event_type, organization_id_snapshot, organization_name_snapshot,
        actor_user_id_snapshot, actor_email_snapshot, metadata
    )
    VALUES (
        'ORGANIZATION_DELETED', p_org_id, v_actual_name,
        v_actor_user_id, 'actor@purged.com', '{"status": "COMPLETED"}'
    );
END;
$$ LANGUAGE plpgsql;
