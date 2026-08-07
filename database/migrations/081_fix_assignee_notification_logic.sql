-- 081_fix_assignee_notification_logic.sql
-- Fix generate_notifications() so that on reassignment (A→B) only B gets notified.
-- The old assignee A is only notified when the task becomes fully unassigned.

CREATE OR REPLACE FUNCTION generate_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_task_record RECORD;
    v_old_assignee INTEGER;
    v_new_assignee INTEGER;
BEGIN
    IF NEW.entity_type IN ('TASK', 'COMMENT') THEN
        SELECT assigned_to INTO v_task_record FROM tasks WHERE id = NEW.entity_id;

        IF NEW.activity_type = 'ASSIGNEE_CHANGED' THEN
            v_old_assignee := (NEW.old_value->>'assigned_to')::INTEGER;
            v_new_assignee := (NEW.new_value->>'assigned_to')::INTEGER;

            IF v_new_assignee IS NOT NULL THEN
                -- Reassignment or fresh assignment: notify new assignee only
                IF v_new_assignee != COALESCE(NEW.user_id, -1) THEN
                    INSERT INTO notifications (user_id, activity_id) VALUES (v_new_assignee, NEW.id);
                END IF;
            ELSIF v_old_assignee IS NOT NULL THEN
                -- Task fully unassigned: notify old assignee
                IF v_old_assignee != COALESCE(NEW.user_id, -1) THEN
                    INSERT INTO notifications (user_id, activity_id) VALUES (v_old_assignee, NEW.id);
                END IF;
            END IF;

        ELSIF NEW.activity_type IN ('DUE_DATE_CHANGED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'TITLE_CHANGED', 'DESCRIPTION_CHANGED') THEN
            IF v_task_record.assigned_to IS NOT NULL AND v_task_record.assigned_to != COALESCE(NEW.user_id, -1) THEN
                INSERT INTO notifications (user_id, activity_id) VALUES (v_task_record.assigned_to, NEW.id);
            END IF;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
