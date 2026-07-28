-- 048_timesheet_row_locking.sql
-- Row-level locking for timesheet state transitions & task assignment re-validation on submission

-- 1. fn_submit_timesheet
CREATE OR REPLACE FUNCTION fn_submit_timesheet(
    p_timesheet_id UUID,
    p_user_id UUID,
    p_member_note TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_target_approver_id UUID DEFAULT NULL
)
RETURNS SETOF timesheets AS $$
DECLARE
    v_ts RECORD;
    v_policy RECORD;
    v_resolved_approver_id UUID := NULL;
BEGIN
    -- Acquire row-level lock BEFORE reading status or performing checks
    PERFORM id FROM timesheets WHERE id = p_timesheet_id FOR UPDATE;

    SELECT * INTO v_ts FROM timesheets WHERE id = p_timesheet_id;
    IF v_ts IS NULL THEN
        RAISE EXCEPTION 'TIMESHEET_NOT_FOUND: Timesheet does not exist';
    END IF;

    IF v_ts.user_id != p_user_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User does not own this timesheet';
    END IF;

    IF (SELECT COUNT(*) FROM timesheet_entries WHERE timesheet_id = p_timesheet_id) = 0 THEN
        RAISE EXCEPTION 'EMPTY_TIMESHEET: Cannot submit an empty timesheet';
    END IF;

    IF v_ts.status = 'submitted' THEN
        RAISE EXCEPTION 'ALREADY_SUBMITTED: This timesheet has already been submitted';
    ELSIF v_ts.status NOT IN ('draft', 'rejected') THEN
        RAISE EXCEPTION 'INVALID_STATUS: Only draft or rejected timesheets can be submitted';
    END IF;

    -- Task assignment re-validation check
    IF EXISTS (
        SELECT 1
        FROM timesheet_entries e
        JOIN tasks t ON (t.id::text = e.task_id::text OR t.id::text = LTRIM(RIGHT(e.task_id::text, 12), '0') OR e.task_id::text = LTRIM(RIGHT(t.id::text, 12), '0'))
        WHERE e.timesheet_id = p_timesheet_id
          AND e.entry_type = 'task'
          AND e.task_id IS NOT NULL
          AND (
              t.assigned_to IS NULL
              OR (
                  t.assigned_to::text != v_ts.user_id::text
                  AND t.assigned_to::text != LTRIM(RIGHT(v_ts.user_id::text, 12), '0')
              )
          )
    ) THEN
        RAISE EXCEPTION 'TASK_ASSIGNMENT_CHANGED: One or more tasks are no longer assigned to you. Please review your entries before submitting.';
    END IF;

    SELECT * INTO v_policy FROM timesheet_policies WHERE (org_id::text = v_ts.org_id::text OR LTRIM(RIGHT(org_id::text, 12), '0') = LTRIM(RIGHT(v_ts.org_id::text, 12), '0'));
    IF CURRENT_DATE > (v_ts.week_end_date + COALESCE(v_policy.submission_deadline_days, 2)) THEN
        RAISE EXCEPTION 'SUBMISSION_DEADLINE_PASSED: Submission deadline passed on %', (v_ts.week_end_date + COALESCE(v_policy.submission_deadline_days, 2));
    END IF;

    -- Target approver resolution
    IF p_target_approver_id IS NOT NULL THEN
        v_resolved_approver_id := p_target_approver_id;
    ELSE
        SELECT approver_user_id INTO v_resolved_approver_id
        FROM timesheet_approver_assignments
        WHERE org_id = v_ts.org_id
          AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    UPDATE timesheets SET
        status = 'submitted',
        approver_id = v_resolved_approver_id,
        submitted_at = NOW(),
        member_note = p_member_note,
        updated_at = NOW()
    WHERE id = p_timesheet_id;

    INSERT INTO timesheet_audit_log (timesheet_id, actor_user_id, from_status, to_status, comment, ip_address, user_agent, created_at)
    VALUES (p_timesheet_id, p_user_id, v_ts.status, 'submitted', p_member_note, p_ip_address, p_user_agent, NOW());

    RETURN QUERY SELECT * FROM timesheets WHERE id = p_timesheet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. fn_approve_timesheet
CREATE OR REPLACE FUNCTION fn_approve_timesheet(
    p_timesheet_id UUID,
    p_approver_id UUID,
    p_comment TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS SETOF timesheets AS $$
DECLARE
    v_has_access BOOLEAN;
    v_status timesheet_status;
BEGIN
    -- Acquire row-level lock BEFORE reading status or performing checks
    PERFORM id FROM timesheets WHERE id = p_timesheet_id FOR UPDATE;

    v_has_access := fn_check_timesheet_approver_access(p_approver_id, p_timesheet_id);
    IF NOT v_has_access THEN
        RAISE EXCEPTION 'UNAUTHORIZED_APPROVER: Approver does not have access permission for this timesheet';
    END IF;

    SELECT status INTO v_status FROM timesheets WHERE id = p_timesheet_id;
    IF v_status != 'submitted' THEN
        RAISE EXCEPTION 'INVALID_STATUS: Only submitted timesheets can be approved';
    END IF;

    UPDATE timesheets SET
        status = 'approved',
        reviewed_at = NOW(),
        approver_id = p_approver_id,
        approver_comment = p_comment,
        updated_at = NOW()
    WHERE id = p_timesheet_id;

    INSERT INTO timesheet_audit_log (timesheet_id, actor_user_id, from_status, to_status, comment, ip_address, user_agent, created_at)
    VALUES (p_timesheet_id, p_approver_id, 'submitted', 'approved', p_comment, p_ip_address, p_user_agent, NOW());

    RETURN QUERY SELECT * FROM timesheets WHERE id = p_timesheet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. fn_reject_timesheet
CREATE OR REPLACE FUNCTION fn_reject_timesheet(
    p_timesheet_id UUID,
    p_approver_id UUID,
    p_comment TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS SETOF timesheets AS $$
DECLARE
    v_has_access BOOLEAN;
    v_status timesheet_status;
BEGIN
    -- Acquire row-level lock BEFORE reading status or performing checks
    PERFORM id FROM timesheets WHERE id = p_timesheet_id FOR UPDATE;

    v_has_access := fn_check_timesheet_approver_access(p_approver_id, p_timesheet_id);
    IF NOT v_has_access THEN
        RAISE EXCEPTION 'UNAUTHORIZED_APPROVER: Approver does not have access permission for this timesheet';
    END IF;

    SELECT status INTO v_status FROM timesheets WHERE id = p_timesheet_id;
    IF v_status != 'submitted' THEN
        RAISE EXCEPTION 'INVALID_STATUS: Only submitted timesheets can be rejected';
    END IF;

    -- Set status to 'rejected' (allows editing by member and visibility in Approver Rejected queue)
    UPDATE timesheets SET
        status = 'rejected',
        reviewed_at = NOW(),
        approver_id = p_approver_id,
        approver_comment = p_comment,
        updated_at = NOW()
    WHERE id = p_timesheet_id;

    INSERT INTO timesheet_audit_log (timesheet_id, actor_user_id, from_status, to_status, comment, ip_address, user_agent, created_at)
    VALUES (p_timesheet_id, p_approver_id, 'submitted', 'rejected', p_comment, p_ip_address, p_user_agent, NOW());

    RETURN QUERY SELECT * FROM timesheets WHERE id = p_timesheet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. fn_recall_timesheet
CREATE OR REPLACE FUNCTION fn_recall_timesheet(
    p_timesheet_id UUID,
    p_user_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS SETOF timesheets AS $$
DECLARE
    v_ts RECORD;
    v_allow_recall BOOLEAN;
BEGIN
    -- Acquire row-level lock BEFORE reading status or performing checks
    PERFORM id FROM timesheets WHERE id = p_timesheet_id FOR UPDATE;

    SELECT * INTO v_ts FROM timesheets WHERE id = p_timesheet_id;
    IF v_ts IS NULL THEN
        RAISE EXCEPTION 'TIMESHEET_NOT_FOUND: Timesheet does not exist';
    END IF;

    IF v_ts.user_id != p_user_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User does not own this timesheet';
    END IF;

    IF v_ts.status != 'submitted' THEN
        RAISE EXCEPTION 'INVALID_STATUS: Only submitted timesheets can be recalled';
    END IF;

    SELECT allow_member_recall INTO v_allow_recall FROM timesheet_policies WHERE (org_id::text = v_ts.org_id::text OR LTRIM(RIGHT(org_id::text, 12), '0') = LTRIM(RIGHT(v_ts.org_id::text, 12), '0'));
    IF v_allow_recall IS NOT NULL AND NOT v_allow_recall THEN
        RAISE EXCEPTION 'RECALL_DISABLED: Policy does not allow member recall of submitted timesheets';
    END IF;

    UPDATE timesheets SET
        status = 'draft',
        submitted_at = NULL,
        updated_at = NOW()
    WHERE id = p_timesheet_id;

    INSERT INTO timesheet_audit_log (timesheet_id, actor_user_id, from_status, to_status, comment, ip_address, user_agent, created_at)
    VALUES (p_timesheet_id, p_user_id, 'submitted', 'recalled', p_reason, p_ip_address, p_user_agent, NOW());

    RETURN QUERY SELECT * FROM timesheets WHERE id = p_timesheet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
