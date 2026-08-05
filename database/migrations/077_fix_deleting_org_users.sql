-- 077_fix_deleting_org_users.sql
-- Ensure users belonging to organizations pending deletion are soft-deleted
-- This fixes users who might have been missed if the organization deletion
-- was initiated before the soft-delete logic was introduced to fn_initiate_organization_deletion.

UPDATE users
SET deleted_at = NOW()
WHERE deleted_at IS NULL
  AND organization_id IN (
      SELECT id FROM organizations WHERE status IN ('DELETING', 'PURGING')
  );
