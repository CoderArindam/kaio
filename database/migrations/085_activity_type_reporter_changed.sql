-- 085_activity_type_reporter_changed.sql
-- Add REPORTER_CHANGED to activity_type_enum

ALTER TYPE activity_type_enum ADD VALUE IF NOT EXISTS 'REPORTER_CHANGED';
