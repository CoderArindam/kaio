-- 099_attachment_annotations.sql
-- Migration to add annotations JSONB column to task_attachments table

ALTER TABLE task_attachments 
ADD COLUMN IF NOT EXISTS annotations JSONB DEFAULT '[]'::jsonb;

-- Update fn_create_attachment to include annotations
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
BEGIN
    INSERT INTO task_attachments (task_id, uploaded_by, file_name, file_url, file_size, mime_type, annotations)
    VALUES (p_task_id, p_user_id, p_file_name, p_file_url, p_file_size, p_mime_type, '[]'::jsonb)
    RETURNING id, task_id, uploaded_by, file_name, file_url, file_size, mime_type, annotations, created_at INTO v_attachment;

    RETURN json_build_object(
        'id', v_attachment.id,
        'task_id', v_attachment.task_id,
        'uploaded_by', v_attachment.uploaded_by,
        'file_name', v_attachment.file_name,
        'file_url', v_attachment.file_url,
        'file_size', v_attachment.file_size,
        'mime_type', v_attachment.mime_type,
        'annotations', v_attachment.annotations,
        'created_at', v_attachment.created_at
    );
END;
$$ LANGUAGE plpgsql;

-- Update fn_get_task_attachments to include annotations
CREATE OR REPLACE FUNCTION fn_get_task_attachments(
    p_task_id INT
) RETURNS JSON AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT COALESCE(json_agg(
        json_build_object(
            'id', ta.id,
            'task_id', ta.task_id,
            'uploaded_by', ta.uploaded_by,
            'file_name', ta.file_name,
            'file_url', ta.file_url,
            'file_size', ta.file_size,
            'mime_type', ta.mime_type,
            'annotations', ta.annotations,
            'created_at', ta.created_at,
            'uploader_first_name', u.first_name,
            'uploader_last_name', u.last_name,
            'uploader_avatar_url', u.avatar_url
        ) ORDER BY ta.created_at DESC
    ), '[]'::json) INTO v_result
    FROM task_attachments ta
    LEFT JOIN users u ON ta.uploaded_by = u.id
    WHERE ta.task_id = p_task_id;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to update annotations
CREATE OR REPLACE FUNCTION fn_update_attachment_annotations(
    p_attachment_id INT,
    p_annotations JSONB
) RETURNS JSON AS $$
DECLARE
    v_attachment RECORD;
BEGIN
    UPDATE task_attachments
    SET annotations = p_annotations
    WHERE id = p_attachment_id
    RETURNING id, task_id, uploaded_by, file_name, file_url, file_size, mime_type, annotations, created_at INTO v_attachment;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attachment not found';
    END IF;

    RETURN json_build_object(
        'id', v_attachment.id,
        'task_id', v_attachment.task_id,
        'uploaded_by', v_attachment.uploaded_by,
        'file_name', v_attachment.file_name,
        'file_url', v_attachment.file_url,
        'file_size', v_attachment.file_size,
        'mime_type', v_attachment.mime_type,
        'annotations', v_attachment.annotations,
        'created_at', v_attachment.created_at
    );
END;
$$ LANGUAGE plpgsql;
