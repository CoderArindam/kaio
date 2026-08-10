-- 094_quick_notes.sql
-- Production-grade Quick Notes feature: per-user, per-org isolated notes
-- with rich text, drawing canvas, image annotation, and optimistic concurrency control.

-- ─────────────────────────────────────────────
-- TABLE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quick_notes (
    id               SERIAL PRIMARY KEY,
    user_id          INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id  INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title            TEXT,
    content_type     TEXT NOT NULL DEFAULT 'richtext'
                         CHECK (content_type IN ('richtext', 'drawing', 'image')),
    rich_content     JSONB,       -- TipTap JSON document
    canvas_data      TEXT,        -- base64 PNG of drawing canvas
    image_url        TEXT,        -- uploaded / captured screenshot image URL
    annotations      JSONB,       -- [{type, x, y, w, h, color, label}]
    is_pinned        BOOLEAN NOT NULL DEFAULT FALSE,
    version          INT NOT NULL DEFAULT 1,  -- optimistic concurrency token
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_quick_notes_user_org
    ON quick_notes (user_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_quick_notes_org
    ON quick_notes (organization_id);

CREATE INDEX IF NOT EXISTS idx_quick_notes_updated_at
    ON quick_notes (user_id, organization_id, updated_at DESC);

-- GIN index for full-text search within JSONB rich content
CREATE INDEX IF NOT EXISTS idx_quick_notes_rich_content_gin
    ON quick_notes USING GIN (rich_content jsonb_path_ops);

-- ─────────────────────────────────────────────
-- AUTO-UPDATE updated_at TRIGGER
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_touch_quick_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_quick_notes_updated_at ON quick_notes;
CREATE TRIGGER trg_quick_notes_updated_at
    BEFORE UPDATE ON quick_notes
    FOR EACH ROW EXECUTE FUNCTION fn_touch_quick_notes_updated_at();

-- ─────────────────────────────────────────────
-- VIEW: v_notes_canonical
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW v_notes_canonical AS
SELECT
    qn.id,
    qn.user_id,
    qn.organization_id,
    qn.title,
    qn.content_type,
    qn.rich_content,
    qn.canvas_data,
    qn.image_url,
    qn.annotations,
    qn.is_pinned,
    qn.version,
    qn.created_at,
    qn.updated_at
FROM quick_notes qn;

-- ─────────────────────────────────────────────
-- FUNCTION: fn_get_user_notes
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_get_user_notes(
    p_user_id        INT,
    p_org_id         INT
) RETURNS JSON AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT COALESCE(json_agg(
        json_build_object(
            'id',             qn.id,
            'user_id',        qn.user_id,
            'organization_id',qn.organization_id,
            'title',          qn.title,
            'content_type',   qn.content_type,
            'rich_content',   qn.rich_content,
            'canvas_data',    qn.canvas_data,
            'image_url',      qn.image_url,
            'annotations',    qn.annotations,
            'is_pinned',      qn.is_pinned,
            'version',        qn.version,
            'created_at',     qn.created_at,
            'updated_at',     qn.updated_at
        ) ORDER BY qn.is_pinned DESC, qn.updated_at DESC
    ), '[]'::json) INTO v_result
    FROM quick_notes qn
    WHERE qn.user_id = p_user_id
      AND qn.organization_id = p_org_id;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- FUNCTION: fn_create_note
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_create_note(
    p_user_id        INT,
    p_org_id         INT,
    p_title          TEXT,
    p_content_type   TEXT,
    p_rich_content   JSONB DEFAULT NULL,
    p_canvas_data    TEXT DEFAULT NULL,
    p_image_url      TEXT DEFAULT NULL,
    p_annotations    JSONB DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_note RECORD;
BEGIN
    -- Validate content_type
    IF p_content_type NOT IN ('richtext', 'drawing', 'image') THEN
        RAISE EXCEPTION 'Invalid content_type: %', p_content_type;
    END IF;

    INSERT INTO quick_notes (
        user_id, organization_id, title, content_type,
        rich_content, canvas_data, image_url, annotations
    )
    VALUES (
        p_user_id, p_org_id, p_title, p_content_type,
        p_rich_content, p_canvas_data, p_image_url, p_annotations
    )
    RETURNING * INTO v_note;

    RETURN json_build_object(
        'id',             v_note.id,
        'user_id',        v_note.user_id,
        'organization_id',v_note.organization_id,
        'title',          v_note.title,
        'content_type',   v_note.content_type,
        'rich_content',   v_note.rich_content,
        'canvas_data',    v_note.canvas_data,
        'image_url',      v_note.image_url,
        'annotations',    v_note.annotations,
        'is_pinned',      v_note.is_pinned,
        'version',        v_note.version,
        'created_at',     v_note.created_at,
        'updated_at',     v_note.updated_at
    );
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- FUNCTION: fn_update_note  (optimistic locking)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_update_note(
    p_note_id          INT,
    p_user_id          INT,
    p_org_id           INT,
    p_title            TEXT,
    p_rich_content     JSONB,
    p_canvas_data      TEXT,
    p_image_url        TEXT,
    p_annotations      JSONB,
    p_is_pinned        BOOLEAN,
    p_expected_version INT   -- optimistic concurrency token
) RETURNS JSON AS $$
DECLARE
    v_note RECORD;
BEGIN
    -- Verify ownership and version atomically
    SELECT * INTO v_note
    FROM quick_notes
    WHERE id = p_note_id
      AND user_id = p_user_id
      AND organization_id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOTE_NOT_FOUND';
    END IF;

    IF v_note.version <> p_expected_version THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: current=%, expected=%', v_note.version, p_expected_version;
    END IF;

    UPDATE quick_notes SET
        title          = COALESCE(p_title, title),
        rich_content   = COALESCE(p_rich_content, rich_content),
        canvas_data    = COALESCE(p_canvas_data, canvas_data),
        image_url      = COALESCE(p_image_url, image_url),
        annotations    = COALESCE(p_annotations, annotations),
        is_pinned      = COALESCE(p_is_pinned, is_pinned),
        version        = version + 1
    WHERE id = p_note_id
    RETURNING * INTO v_note;

    RETURN json_build_object(
        'id',             v_note.id,
        'user_id',        v_note.user_id,
        'organization_id',v_note.organization_id,
        'title',          v_note.title,
        'content_type',   v_note.content_type,
        'rich_content',   v_note.rich_content,
        'canvas_data',    v_note.canvas_data,
        'image_url',      v_note.image_url,
        'annotations',    v_note.annotations,
        'is_pinned',      v_note.is_pinned,
        'version',        v_note.version,
        'created_at',     v_note.created_at,
        'updated_at',     v_note.updated_at
    );
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- FUNCTION: fn_delete_note
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_delete_note(
    p_note_id  INT,
    p_user_id  INT,
    p_org_id   INT
) RETURNS JSON AS $$
DECLARE
    v_note RECORD;
BEGIN
    SELECT id, image_url, canvas_data INTO v_note
    FROM quick_notes
    WHERE id = p_note_id
      AND user_id = p_user_id
      AND organization_id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOTE_NOT_FOUND';
    END IF;

    DELETE FROM quick_notes WHERE id = p_note_id;

    RETURN json_build_object(
        'id',        v_note.id,
        'image_url', v_note.image_url
    );
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- FUNCTION: fn_toggle_pin_note
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_toggle_pin_note(
    p_note_id  INT,
    p_user_id  INT,
    p_org_id   INT
) RETURNS JSON AS $$
DECLARE
    v_note RECORD;
BEGIN
    UPDATE quick_notes
    SET is_pinned = NOT is_pinned,
        version   = version + 1
    WHERE id = p_note_id
      AND user_id = p_user_id
      AND organization_id = p_org_id
    RETURNING * INTO v_note;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOTE_NOT_FOUND';
    END IF;

    RETURN json_build_object(
        'id',        v_note.id,
        'is_pinned', v_note.is_pinned,
        'version',   v_note.version
    );
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- FUNCTION: fn_search_notes
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_search_notes(
    p_user_id  INT,
    p_org_id   INT,
    p_query    TEXT
) RETURNS JSON AS $$
DECLARE
    v_result JSON;
    v_tsquery TSQUERY;
BEGIN
    -- Build safe tsquery (plainto avoids injection)
    v_tsquery := plainto_tsquery('english', p_query);

    SELECT COALESCE(json_agg(
        json_build_object(
            'id',           qn.id,
            'title',        qn.title,
            'content_type', qn.content_type,
            'rich_content', qn.rich_content,
            'is_pinned',    qn.is_pinned,
            'version',      qn.version,
            'created_at',   qn.created_at,
            'updated_at',   qn.updated_at
        ) ORDER BY qn.updated_at DESC
    ), '[]'::json) INTO v_result
    FROM quick_notes qn
    WHERE qn.user_id = p_user_id
      AND qn.organization_id = p_org_id
      AND (
          -- Title match (case-insensitive)
          qn.title ILIKE '%' || p_query || '%'
          -- JSONB rich content text search
          OR (qn.rich_content IS NOT NULL
              AND to_tsvector('english', qn.rich_content::text) @@ v_tsquery)
      );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;
