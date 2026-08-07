-- 092_activity_type_task_reminder.sql
-- Add TASK_REMINDER to activity_type_enum

ALTER TYPE activity_type_enum ADD VALUE IF NOT EXISTS 'TASK_REMINDER';
