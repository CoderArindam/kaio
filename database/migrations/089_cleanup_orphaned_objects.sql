-- 089_cleanup_orphaned_objects.sql
-- Removes genuinely orphaned views and functions identified during the database audit.

-- 1. Drop orphaned canonical view
DROP VIEW IF EXISTS v_task_labels_canonical;

-- 2. Drop orphaned functions
DROP FUNCTION IF EXISTS fn_toggle_comment_reaction(integer, text, integer);
DROP FUNCTION IF EXISTS is_org_admin(integer, integer);
DROP FUNCTION IF EXISTS is_org_manager_or_admin(integer, integer);
DROP FUNCTION IF EXISTS is_org_member(integer, integer);
