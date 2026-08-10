-- 095_timesheet_approver_views.sql
-- Create views to abstract timesheet eligible approvers logic, adhering to the architecture rule of no inline SQL in routers.

CREATE OR REPLACE VIEW v_eligible_timesheet_approvers_canonical AS
SELECT DISTINCT
    u.id AS user_id,
    u.organization_id AS org_id,
    COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email) AS display_name,
    u.email,
    u.role::text AS role,
    true AS is_approver
FROM v_users_canonical u
LEFT JOIN timesheet_approver_assignments taa 
    ON (taa.approver_user_id::text = u.id::text OR u.id::text = LTRIM(RIGHT(taa.approver_user_id::text, 12), '0'))
    AND (taa.org_id::text = u.organization_id::text OR u.organization_id::text = LTRIM(RIGHT(taa.org_id::text, 12), '0'))
    AND taa.is_active = true
WHERE LOWER(u.role::text) IN ('superadmin', 'super_admin') OR taa.id IS NOT NULL;


CREATE OR REPLACE VIEW v_all_managers_timesheet_approver_status_canonical AS
SELECT DISTINCT
    u.id AS user_id,
    u.organization_id AS org_id,
    COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email) AS display_name,
    u.email,
    u.role::text AS role,
    EXISTS (
        SELECT 1 FROM timesheet_approver_assignments taa 
        WHERE (taa.approver_user_id::text = u.id::text OR u.id::text = LTRIM(RIGHT(taa.approver_user_id::text, 12), '0'))
            AND (taa.org_id::text = u.organization_id::text OR u.organization_id::text = LTRIM(RIGHT(taa.org_id::text, 12), '0'))
            AND taa.is_active = true
    ) AS is_approver
FROM v_users_canonical u
WHERE LOWER(u.role::text) IN ('superadmin', 'super_admin', 'manager');
