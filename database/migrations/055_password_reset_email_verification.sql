-- 055_password_reset_email_verification.sql
-- Password reset and email verification: tables, functions, and view update

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Part A: Extend users table
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP NULL;

-- ============================================================
-- Part B: Password reset tokens table
-- ============================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id            SERIAL PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    VARCHAR(64) NOT NULL,
  expires_at    TIMESTAMP NOT NULL,
  used_at       TIMESTAMP NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prt_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user_id ON password_reset_tokens(user_id);

-- ============================================================
-- Part C: Email verification tokens table
-- ============================================================

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id            SERIAL PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    VARCHAR(64) NOT NULL,
  expires_at    TIMESTAMP NOT NULL,
  used_at       TIMESTAMP NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evt_token_hash ON email_verification_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_evt_user_id ON email_verification_tokens(user_id);

-- ============================================================
-- Part D: fn_create_password_reset_token
-- ============================================================

CREATE OR REPLACE FUNCTION fn_create_password_reset_token(p_email TEXT)
RETURNS TABLE(raw_token TEXT, user_first_name TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_user_id     INT;
  v_first_name  TEXT;
  v_raw_token   TEXT;
BEGIN
  SELECT id, first_name
    INTO v_user_id, v_first_name
    FROM users
   WHERE LOWER(email) = LOWER(p_email)
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Invalidate any existing unused tokens for this user
  UPDATE password_reset_tokens
     SET used_at = NOW()
   WHERE user_id = v_user_id
     AND used_at IS NULL;

  -- Generate a cryptographically random 32-byte hex token
  v_raw_token := encode(gen_random_bytes(32), 'hex');

  -- Store only the SHA256 hash
  INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
  VALUES (
    v_user_id,
    encode(digest(v_raw_token, 'sha256'), 'hex'),
    NOW() + INTERVAL '1 hour'
  );

  RETURN QUERY SELECT v_raw_token, v_first_name;
END;
$$;

-- ============================================================
-- Part E: fn_reset_password
-- ============================================================

CREATE OR REPLACE FUNCTION fn_reset_password(p_token TEXT, p_new_password_hash TEXT)
RETURNS TABLE(success BOOLEAN, error_code TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_token_hash  TEXT;
  v_token_row   password_reset_tokens%ROWTYPE;
  v_org_id      INT;
BEGIN
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_token_row
    FROM password_reset_tokens
   WHERE token_hash = v_token_hash
     AND used_at IS NULL
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'TOKEN_INVALID';
    RETURN;
  END IF;

  IF v_token_row.expires_at < NOW() THEN
    RETURN QUERY SELECT FALSE, 'TOKEN_EXPIRED';
    RETURN;
  END IF;

  -- Update the password
  UPDATE users
     SET password_hash = p_new_password_hash
   WHERE id = v_token_row.user_id;

  -- Mark token as used
  UPDATE password_reset_tokens
     SET used_at = NOW()
   WHERE id = v_token_row.id;

  -- Log security event
  SELECT organization_id INTO v_org_id FROM users WHERE id = v_token_row.user_id;

  PERFORM fn_log_security_event(
    v_org_id,
    v_token_row.user_id,
    'PASSWORD_RESET',
    'USER'::entity_type_enum,
    v_token_row.user_id,
    NULL,
    '{"method": "reset_token"}'::jsonb
  );

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

-- ============================================================
-- Part F: fn_create_email_verification_token
-- ============================================================

CREATE OR REPLACE FUNCTION fn_create_email_verification_token(p_user_id INT)
RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  v_raw_token TEXT;
BEGIN
  -- Invalidate any existing unused tokens for this user
  UPDATE email_verification_tokens
     SET used_at = NOW()
   WHERE user_id = p_user_id
     AND used_at IS NULL;

  v_raw_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
  VALUES (
    p_user_id,
    encode(digest(v_raw_token, 'sha256'), 'hex'),
    NOW() + INTERVAL '24 hours'
  );

  RETURN v_raw_token;
END;
$$;

-- ============================================================
-- Part G: fn_verify_email
-- ============================================================

CREATE OR REPLACE FUNCTION fn_verify_email(p_token TEXT)
RETURNS TABLE(success BOOLEAN, error_code TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_token_hash TEXT;
  v_token_row  email_verification_tokens%ROWTYPE;
BEGIN
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_token_row
    FROM email_verification_tokens
   WHERE token_hash = v_token_hash
     AND used_at IS NULL
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'TOKEN_INVALID';
    RETURN;
  END IF;

  IF v_token_row.expires_at < NOW() THEN
    RETURN QUERY SELECT FALSE, 'TOKEN_EXPIRED';
    RETURN;
  END IF;

  UPDATE users
     SET is_email_verified = TRUE,
         email_verified_at = NOW()
   WHERE id = v_token_row.user_id;

  UPDATE email_verification_tokens
     SET used_at = NOW()
   WHERE id = v_token_row.id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

-- ============================================================
-- Part H: Update v_users_canonical
-- ============================================================

DROP VIEW IF EXISTS v_users_canonical CASCADE;
CREATE OR REPLACE VIEW v_users_canonical AS
SELECT
    id,
    organization_id,
    email,
    password_hash,
    first_name,
    last_name,
    avatar_url,
    role,
    is_email_verified,
    email_verified_at,
    created_at,
    deleted_at
FROM users
WHERE deleted_at IS NULL;
