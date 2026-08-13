-- 095_comprehensive_activity_logging.sql
-- Expand activity types and intercept all core actions to log activities correctly.

-- 1. Extend Activity Type Enum
ALTER TYPE activity_type_enum ADD VALUE IF NOT EXISTS 'ATTACHMENT_REMOVED';
ALTER TYPE activity_type_enum ADD VALUE IF NOT EXISTS 'TIME_LOGGED';
ALTER TYPE activity_type_enum ADD VALUE IF NOT EXISTS 'ESTIMATE_CHANGED';
ALTER TYPE activity_type_enum ADD VALUE IF NOT EXISTS 'LABEL_ADDED';
ALTER TYPE activity_type_enum ADD VALUE IF NOT EXISTS 'LABEL_REMOVED';
ALTER TYPE activity_type_enum ADD VALUE IF NOT EXISTS 'COMMENT_REACTION_ADDED';
ALTER TYPE activity_type_enum ADD VALUE IF NOT EXISTS 'COMMENT_REACTION_REMOVED';


-- 2. Update Attachment Functions
CREATE OR REPLACE FUNCTION fn_create_attachment(
    p_task_id INT,
    p_user_id INT,
    p_file_name VARCHAR,
    p_file_url VARCHAR,
    p_file_size BIGINT DEFAULT NULL,
    p_mime_type VARCHAR DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_attachment RECORD;
    v_org_id INTEGER;
BEGIN
    SELECT b.organization_id INTO v_org_id
    FROM tasks t JOIN boards b ON t.board_id = b.id
    WHERE t.id = p_task_id;

    INSERT INTO task_attachments (task_id, uploaded_by, file_name, file_url, file_size, mime_type)
    VALUES (p_task_id, p_user_id, p_file_name, p_file_url, p_file_size, p_mime_type)
    RETURNING id, task_id, uploaded_by, file_name, file_url, file_size, mime_type, created_at INTO v_attachment;

    INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value)
    VALUES (v_org_id, 'TASK', p_task_id, p_user_id, 'ATTACHMENT_ADDED', jsonb_build_object('file_name', p_file_name, 'attachment_id', v_attachment.id));

    RETURN json_build_object(
        'id', v_attachment.id,
        'task_id', v_attachment.task_id,
        'uploaded_by', v_attachment.uploaded_by,
        'file_name', v_attachment.file_name,
        'file_url', v_attachment.file_url,
        'file_size', v_attachment.file_size,
        'mime_type', v_attachment.mime_type,
        'created_at', v_attachment.created_at
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_delete_attachment(
    p_attachment_id INT,
    p_user_id INT
) RETURNS JSON AS $$
DECLARE
    v_attachment RECORD;
    v_org_id INTEGER;
BEGIN
    SELECT ta.id, ta.task_id, ta.uploaded_by, ta.file_name, ta.file_url, ta.file_size, ta.mime_type, b.organization_id
    INTO v_attachment
    FROM task_attachments ta
    JOIN tasks t ON ta.task_id = t.id
    JOIN boards b ON t.board_id = b.id
    WHERE ta.id = p_attachment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attachment not found';
    END IF;

    DELETE FROM task_attachments WHERE id = p_attachment_id;

    INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, old_value, new_value)
    VALUES (v_attachment.organization_id, 'TASK', v_attachment.task_id, p_user_id, 'ATTACHMENT_REMOVED', NULL, jsonb_build_object('file_name', v_attachment.file_name, 'attachment_id', p_attachment_id));

    RETURN json_build_object(
        'id', v_attachment.id,
        'task_id', v_attachment.task_id,
        'uploaded_by', v_attachment.uploaded_by,
        'file_name', v_attachment.file_name,
        'file_url', v_attachment.file_url
    );
END;
$$ LANGUAGE plpgsql;


-- 3. Update Label Functions
CREATE OR REPLACE FUNCTION fn_attach_label(
    p_task_id INTEGER,
    p_label_id INTEGER,
    p_user_id INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_task_board_id INTEGER;
    v_label_board_id INTEGER;
    v_label_name VARCHAR;
    v_label_color VARCHAR;
    v_org_id INTEGER;
BEGIN
    SELECT t.board_id, b.organization_id INTO v_task_board_id, v_org_id
    FROM tasks t
    JOIN boards b ON t.board_id = b.id
    WHERE t.id = p_task_id AND t.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found: %', p_task_id;
    END IF;

    SELECT l.board_id, l.name, l.color INTO v_label_board_id, v_label_name, v_label_color
    FROM labels l
    WHERE l.id = p_label_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Label not found: %', p_label_id;
    END IF;

    IF v_task_board_id != v_label_board_id THEN
        RAISE EXCEPTION 'Task and label belong to different boards';
    END IF;

    IF NOT fn_check_board_access(p_user_id, v_task_board_id, 'EDIT') THEN
        RAISE EXCEPTION 'Access denied: Insufficient permissions to modify task %', p_task_id;
    END IF;

    INSERT INTO task_labels (task_id, label_id)
    VALUES (p_task_id, p_label_id)
    ON CONFLICT (task_id, label_id) DO NOTHING;

    -- Log activity
    INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value)
    VALUES (
        v_org_id,
        'TASK'::entity_type_enum,
        p_task_id,
        p_user_id,
        'LABEL_ADDED'::activity_type_enum,
        jsonb_build_object('label_id', p_label_id, 'label_name', v_label_name, 'label_color', v_label_color)
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION fn_detach_label(
    p_task_id INTEGER,
    p_label_id INTEGER,
    p_user_id INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_task_board_id INTEGER;
    v_label_board_id INTEGER;
    v_label_name VARCHAR;
    v_label_color VARCHAR;
    v_org_id INTEGER;
BEGIN
    SELECT t.board_id, b.organization_id INTO v_task_board_id, v_org_id
    FROM tasks t
    JOIN boards b ON t.board_id = b.id
    WHERE t.id = p_task_id AND t.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found: %', p_task_id;
    END IF;

    SELECT l.board_id, l.name, l.color INTO v_label_board_id, v_label_name, v_label_color
    FROM labels l
    WHERE l.id = p_label_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Label not found: %', p_label_id;
    END IF;

    IF NOT fn_check_board_access(p_user_id, v_task_board_id, 'EDIT') THEN
        RAISE EXCEPTION 'Access denied: Insufficient permissions to modify task %', p_task_id;
    END IF;

    DELETE FROM task_labels
    WHERE task_id = p_task_id AND label_id = p_label_id;

    -- Log activity
    INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, old_value, new_value)
    VALUES (
        v_org_id,
        'TASK'::entity_type_enum,
        p_task_id,
        p_user_id,
        'LABEL_REMOVED'::activity_type_enum,
        NULL,
        jsonb_build_object('label_id', p_label_id, 'label_name', v_label_name, 'label_color', v_label_color)
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Update Time Tracking Function
CREATE OR REPLACE FUNCTION fn_log_task_time(
    p_user_id UUID,
    p_org_id UUID,
    p_task_id INT,
    p_entry_date DATE,
    p_hours NUMERIC(4,2),
    p_description TEXT DEFAULT NULL
)
RETURNS SETOF v_tasks_canonical AS $$
DECLARE
    v_board_id_int INT;
    v_assigned_to_int INT;
    v_week_start DATE;
    v_ts_id UUID;
    v_ts_status timesheet_status;
    v_task_uuid UUID;
    v_board_uuid UUID;
    v_ts_row RECORD;
    v_internal_org_id INTEGER;
    v_internal_user_id INTEGER;
BEGIN
    -- Verify task exists and retrieve details
    SELECT t.board_id, t.assigned_to, b.organization_id INTO v_board_id_int, v_assigned_to_int, v_internal_org_id
    FROM tasks t JOIN boards b ON t.board_id = b.id
    WHERE t.id = p_task_id AND t.deleted_at IS NULL;

    IF v_board_id_int IS NULL THEN
        RAISE EXCEPTION 'TASK_NOT_FOUND: Task % does not exist', p_task_id;
    END IF;
    
    -- Extract integer user ID from UUID
    BEGIN
        v_internal_user_id := (regexp_replace(p_user_id::text, '^00000000-0000-0000-0000-', '', 'g'))::integer;
    EXCEPTION WHEN OTHERS THEN
        v_internal_user_id := NULL;
    END;

    -- Calculate Monday week start date
    v_week_start := date_trunc('week', p_entry_date)::date;

    -- Look for existing timesheet for this user & week
    SELECT id, status INTO v_ts_id, v_ts_status
    FROM timesheets
    WHERE org_id = p_org_id AND user_id = p_user_id AND week_start_date = v_week_start
    FOR UPDATE;

    IF v_ts_id IS NULL THEN
        -- Auto-create draft timesheet
        SELECT * INTO v_ts_row FROM fn_create_timesheet(p_user_id, p_org_id, v_week_start);
        v_ts_id := v_ts_row.id;
        v_ts_status := 'draft';
    ELSIF v_ts_status != 'draft' THEN
        RAISE EXCEPTION 'TIMESHEET_LOCKED: Timesheet for week of % is % and cannot be modified', v_week_start, v_ts_status;
    END IF;

    -- Format task_id and board_id to standard 12-digit integer UUIDs for timesheet_entries
    v_task_uuid := ('00000000-0000-0000-0000-' || LPAD(p_task_id::text, 12, '0'))::uuid;
    v_board_uuid := ('00000000-0000-0000-0000-' || LPAD(v_board_id_int::text, 12, '0'))::uuid;

    -- Insert or update timesheet entry
    PERFORM fn_upsert_timesheet_entry(
        v_ts_id,
        p_user_id,
        v_board_uuid,
        v_task_uuid,
        p_entry_date,
        p_hours,
        'task'::timesheet_entry_type,
        p_description,
        NULL::uuid,
        NULL::uuid
    );
    
    IF v_internal_user_id IS NOT NULL AND v_internal_org_id IS NOT NULL THEN
        INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value)
        VALUES (v_internal_org_id, 'TASK', p_task_id, v_internal_user_id, 'TIME_LOGGED', jsonb_build_object('hours', p_hours, 'entry_date', p_entry_date));
    END IF;

    RETURN QUERY SELECT * FROM v_tasks_canonical WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;


-- 5. Update Task Trigger for ESTIMATE_CHANGED
CREATE OR REPLACE FUNCTION generate_task_activity()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id INTEGER;
    v_actor_id INTEGER;
    v_setting TEXT;
    v_old_column_name VARCHAR;
    v_new_column_name VARCHAR;
    v_old_assignee_name VARCHAR;
    v_new_assignee_name VARCHAR;
BEGIN
    SELECT organization_id INTO v_org_id FROM boards WHERE id = COALESCE(NEW.board_id, OLD.board_id);
    
    v_setting := current_setting('app.current_user_id', true);
    IF v_setting IS NOT NULL AND v_setting != '' THEN
        v_actor_id := v_setting::INTEGER;
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, old_value, new_value)
        VALUES (v_org_id, 'TASK', NEW.id, COALESCE(v_actor_id, NEW.created_by), 'CREATED', NULL, jsonb_build_object('title', NEW.title));
    
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.column_id IS DISTINCT FROM OLD.column_id THEN
            SELECT name INTO v_old_column_name FROM board_columns WHERE id = OLD.column_id;
            SELECT name INTO v_new_column_name FROM board_columns WHERE id = NEW.column_id;
            INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, old_value, new_value)
            VALUES (
                v_org_id, 'TASK', NEW.id, v_actor_id, 'STATUS_CHANGED', 
                jsonb_build_object('column_id', OLD.column_id, 'column_name', v_old_column_name), 
                jsonb_build_object('column_id', NEW.column_id, 'column_name', v_new_column_name)
            );
        END IF;

        IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
            IF OLD.assigned_to IS NOT NULL THEN
                SELECT COALESCE(NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), ''), email) 
                INTO v_old_assignee_name FROM users WHERE id = OLD.assigned_to;
            END IF;
            IF NEW.assigned_to IS NOT NULL THEN
                SELECT COALESCE(NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), ''), email) 
                INTO v_new_assignee_name FROM users WHERE id = NEW.assigned_to;
            END IF;
            INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, old_value, new_value)
            VALUES (
                v_org_id, 'TASK', NEW.id, v_actor_id, 'ASSIGNEE_CHANGED', 
                jsonb_build_object('assigned_to', OLD.assigned_to, 'assignee_name', v_old_assignee_name), 
                jsonb_build_object('assigned_to', NEW.assigned_to, 'assignee_name', v_new_assignee_name)
            );
        END IF;

        IF NEW.priority IS DISTINCT FROM OLD.priority THEN
            INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, old_value, new_value)
            VALUES (
                v_org_id, 'TASK', NEW.id, v_actor_id, 'PRIORITY_CHANGED', 
                jsonb_build_object('priority', OLD.priority), 
                jsonb_build_object('priority', NEW.priority)
            );
        END IF;

        IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
            INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, old_value, new_value)
            VALUES (
                v_org_id, 'TASK', NEW.id, v_actor_id, 'DUE_DATE_CHANGED', 
                jsonb_build_object('due_date', OLD.due_date), 
                jsonb_build_object('due_date', NEW.due_date)
            );
        END IF;

        IF NEW.title IS DISTINCT FROM OLD.title THEN
            INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, old_value, new_value)
            VALUES (
                v_org_id, 'TASK', NEW.id, v_actor_id, 'TITLE_CHANGED', 
                jsonb_build_object('title', OLD.title), 
                jsonb_build_object('title', NEW.title)
            );
        END IF;

        IF NEW.description IS DISTINCT FROM OLD.description THEN
            INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, old_value, new_value)
            VALUES (
                v_org_id, 'TASK', NEW.id, v_actor_id, 'DESCRIPTION_CHANGED', 
                jsonb_build_object('description', OLD.description), 
                jsonb_build_object('description', NEW.description)
            );
        END IF;
        
        IF NEW.estimate_hours IS DISTINCT FROM OLD.estimate_hours THEN
            INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, old_value, new_value)
            VALUES (
                v_org_id, 'TASK', NEW.id, v_actor_id, 'ESTIMATE_CHANGED', 
                jsonb_build_object('estimate_hours', OLD.estimate_hours), 
                jsonb_build_object('estimate_hours', NEW.estimate_hours)
            );
        END IF;
    END IF;

    RETURN NULL; 
END;
$$ LANGUAGE plpgsql;


-- 6. Update Comment Functions
CREATE OR REPLACE FUNCTION fn_create_comment(
    p_task_id INTEGER,
    p_user_id INTEGER,
    p_parent_comment_id INTEGER,
    p_content TEXT,
    p_org_id INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_comment_id INTEGER;
    v_activity_id INTEGER;
BEGIN
    INSERT INTO task_comments (task_id, user_id, parent_comment_id, content)
    VALUES (p_task_id, p_user_id, p_parent_comment_id, p_content)
    RETURNING id INTO v_comment_id;

    IF p_parent_comment_id IS NOT NULL THEN
        INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value)
        VALUES (p_org_id, 'COMMENT', p_task_id, p_user_id, 'COMMENT_REPLIED', jsonb_build_object('content', p_content, 'comment_id', v_comment_id, 'parent_comment_id', p_parent_comment_id))
        RETURNING id INTO v_activity_id;
    ELSE
        INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value)
        VALUES (p_org_id, 'COMMENT', p_task_id, p_user_id, 'COMMENT_ADDED', jsonb_build_object('content', p_content, 'comment_id', v_comment_id))
        RETURNING id INTO v_activity_id;
    END IF;

    RETURN v_comment_id;
END;
$$ LANGUAGE plpgsql;


-- 7. Update Comment Reactions
CREATE OR REPLACE FUNCTION fn_add_comment_reaction(
    p_comment_id INTEGER,
    p_user_id INTEGER,
    p_emoji TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_task_id INTEGER;
    v_org_id INTEGER;
BEGIN
    SELECT t.id, b.organization_id INTO v_task_id, v_org_id
    FROM task_comments c
    JOIN tasks t ON c.task_id = t.id
    JOIN boards b ON t.board_id = b.id
    WHERE c.id = p_comment_id AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comment not found';
    END IF;

    INSERT INTO comment_reactions (comment_id, user_id, emoji)
    VALUES (p_comment_id, p_user_id, p_emoji)
    ON CONFLICT (comment_id, user_id, emoji) DO NOTHING;
    
    IF FOUND THEN
        INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value)
        VALUES (v_org_id, 'COMMENT', v_task_id, p_user_id, 'COMMENT_REACTION_ADDED', jsonb_build_object('emoji', p_emoji, 'comment_id', p_comment_id));
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION fn_remove_comment_reaction(
    p_comment_id INTEGER,
    p_user_id INTEGER,
    p_emoji TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_task_id INTEGER;
    v_org_id INTEGER;
BEGIN
    SELECT t.id, b.organization_id INTO v_task_id, v_org_id
    FROM task_comments c
    JOIN tasks t ON c.task_id = t.id
    JOIN boards b ON t.board_id = b.id
    WHERE c.id = p_comment_id AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comment not found';
    END IF;

    DELETE FROM comment_reactions
    WHERE comment_id = p_comment_id AND user_id = p_user_id AND emoji = p_emoji;
    
    IF FOUND THEN
        INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value)
        VALUES (v_org_id, 'COMMENT', v_task_id, p_user_id, 'COMMENT_REACTION_REMOVED', jsonb_build_object('emoji', p_emoji, 'comment_id', p_comment_id));
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
