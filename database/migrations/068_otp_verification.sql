-- 068_otp_verification.sql
-- Production-grade OTP verification and 2FA authentication schema, stored functions, and canonical view update

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Part A: Extend users table
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_2fa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS two_factor_type VARCHAR(20) NOT NULL DEFAULT 'email';

-- ============================================================
-- Part B: OTP codes table
-- ============================================================

CREATE TABLE IF NOT EXISTS otp_codes (
  id              SERIAL PRIMARY KEY,
  user_id         INT NULL REFERENCES users(id) ON DELETE CASCADE,
  email           VARCHAR(255) NOT NULL,
  purpose         VARCHAR(50) NOT NULL, -- 'ORG_REGISTRATION', 'LOGIN_2FA', 'ENABLE_2FA', 'SECURITY_ACTION'
  mfa_token_hash  VARCHAR(64) NOT NULL,
  otp_hash        VARCHAR(64) NOT NULL,
  payload         JSONB NULL,
  attempts_count  INT NOT NULL DEFAULT 0,
  max_attempts    INT NOT NULL DEFAULT 5,
  expires_at      TIMESTAMP NOT NULL,
  used_at         TIMESTAMP NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oc_mfa_token_hash ON otp_codes(mfa_token_hash);
CREATE INDEX IF NOT EXISTS idx_oc_email ON otp_codes(email);
CREATE INDEX IF NOT EXISTS idx_oc_user_id ON otp_codes(user_id);

-- ============================================================
-- Part C: fn_create_registration_otp
-- ============================================================

CREATE OR REPLACE FUNCTION fn_create_registration_otp(
  p_email TEXT,
  p_payload JSONB,
  p_expires_in_minutes INT DEFAULT 10
)
RETURNS TABLE(raw_otp TEXT, mfa_token TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_raw_otp   TEXT;
  v_mfa_token TEXT;
BEGIN
  -- Invalidate any existing unused registration OTPs for this email
  UPDATE otp_codes
     SET used_at = NOW()
   WHERE LOWER(email) = LOWER(p_email)
     AND purpose = 'ORG_REGISTRATION'
     AND used_at IS NULL;

  -- Generate 6-digit numeric OTP code (100000 - 999999)
  v_raw_otp := LPAD(FLOOR(random() * 900000 + 100000)::TEXT, 6, '0');

  -- Generate random raw mfa token
  v_mfa_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO otp_codes (
    user_id,
    email,
    purpose,
    mfa_token_hash,
    otp_hash,
    payload,
    expires_at
  ) VALUES (
    NULL,
    LOWER(p_email),
    'ORG_REGISTRATION',
    encode(digest(v_mfa_token, 'sha256'), 'hex'),
    encode(digest(v_raw_otp, 'sha256'), 'hex'),
    p_payload,
    NOW() + (p_expires_in_minutes || ' minutes')::INTERVAL
  );

  RETURN QUERY SELECT v_raw_otp, v_mfa_token;
END;
$$;

-- ============================================================
-- Part D: fn_verify_registration_otp
-- ============================================================

CREATE OR REPLACE FUNCTION fn_verify_registration_otp(
  p_mfa_token TEXT,
  p_otp_code TEXT
)
RETURNS TABLE(success BOOLEAN, error_code TEXT, payload JSONB, email TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_token_hash  TEXT;
  v_otp_hash    TEXT;
  v_row         otp_codes%ROWTYPE;
BEGIN
  v_token_hash := encode(digest(p_mfa_token, 'sha256'), 'hex');

  SELECT * INTO v_row
    FROM otp_codes
   WHERE mfa_token_hash = v_token_hash
     AND purpose = 'ORG_REGISTRATION'
     AND used_at IS NULL
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'TOKEN_INVALID'::TEXT, NULL::JSONB, NULL::TEXT;
    RETURN;
  END IF;

  IF v_row.expires_at < NOW() THEN
    UPDATE otp_codes SET used_at = NOW() WHERE id = v_row.id;
    RETURN QUERY SELECT FALSE, 'OTP_EXPIRED'::TEXT, NULL::JSONB, NULL::TEXT;
    RETURN;
  END IF;

  IF v_row.attempts_count >= v_row.max_attempts THEN
    UPDATE otp_codes SET used_at = NOW() WHERE id = v_row.id;
    RETURN QUERY SELECT FALSE, 'MAX_ATTEMPTS_EXCEEDED'::TEXT, NULL::JSONB, NULL::TEXT;
    RETURN;
  END IF;

  v_otp_hash := encode(digest(p_otp_code, 'sha256'), 'hex');

  IF v_row.otp_hash <> v_otp_hash THEN
    UPDATE otp_codes
       SET attempts_count = attempts_count + 1
     WHERE id = v_row.id;

    IF (v_row.attempts_count + 1) >= v_row.max_attempts THEN
      UPDATE otp_codes SET used_at = NOW() WHERE id = v_row.id;
      RETURN QUERY SELECT FALSE, 'MAX_ATTEMPTS_EXCEEDED'::TEXT, NULL::JSONB, NULL::TEXT;
    ELSE
      RETURN QUERY SELECT FALSE, 'INVALID_OTP'::TEXT, NULL::JSONB, NULL::TEXT;
    END IF;
    RETURN;
  END IF;

  -- Mark OTP as used
  UPDATE otp_codes SET used_at = NOW() WHERE id = v_row.id;

  RETURN QUERY SELECT TRUE, NULL::TEXT, v_row.payload, v_row.email;
END;
$$;

-- ============================================================
-- Part E: fn_create_otp_code
-- ============================================================

CREATE OR REPLACE FUNCTION fn_create_otp_code(
  p_user_id INT,
  p_email TEXT,
  p_purpose TEXT,
  p_expires_in_minutes INT DEFAULT 10,
  p_max_attempts INT DEFAULT 5
)
RETURNS TABLE(raw_otp TEXT, mfa_token TEXT, user_first_name TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_raw_otp    TEXT;
  v_mfa_token  TEXT;
  v_first_name TEXT;
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT first_name INTO v_first_name FROM users WHERE id = p_user_id;
  END IF;

  -- Invalidate previous unused tokens for this user & purpose
  UPDATE otp_codes
     SET used_at = NOW()
   WHERE ((p_user_id IS NOT NULL AND user_id = p_user_id) OR (p_user_id IS NULL AND LOWER(email) = LOWER(p_email)))
     AND purpose = p_purpose
     AND used_at IS NULL;

  v_raw_otp := LPAD(FLOOR(random() * 900000 + 100000)::TEXT, 6, '0');
  v_mfa_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO otp_codes (
    user_id,
    email,
    purpose,
    mfa_token_hash,
    otp_hash,
    max_attempts,
    expires_at
  ) VALUES (
    p_user_id,
    LOWER(p_email),
    p_purpose,
    encode(digest(v_mfa_token, 'sha256'), 'hex'),
    encode(digest(v_raw_otp, 'sha256'), 'hex'),
    p_max_attempts,
    NOW() + (p_expires_in_minutes || ' minutes')::INTERVAL
  );

  RETURN QUERY SELECT v_raw_otp, v_mfa_token, v_first_name;
END;
$$;

-- ============================================================
-- Part F: fn_verify_otp_code
-- ============================================================

CREATE OR REPLACE FUNCTION fn_verify_otp_code(
  p_mfa_token TEXT,
  p_otp_code TEXT,
  p_purpose TEXT
)
RETURNS TABLE(success BOOLEAN, error_code TEXT, user_id INT, email TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_token_hash TEXT;
  v_otp_hash   TEXT;
  v_row        otp_codes%ROWTYPE;
BEGIN
  v_token_hash := encode(digest(p_mfa_token, 'sha256'), 'hex');

  SELECT * INTO v_row
    FROM otp_codes
   WHERE mfa_token_hash = v_token_hash
     AND purpose = p_purpose
     AND used_at IS NULL
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'TOKEN_INVALID'::TEXT, NULL::INT, NULL::TEXT;
    RETURN;
  END IF;

  IF v_row.expires_at < NOW() THEN
    UPDATE otp_codes SET used_at = NOW() WHERE id = v_row.id;
    RETURN QUERY SELECT FALSE, 'OTP_EXPIRED'::TEXT, NULL::INT, NULL::TEXT;
    RETURN;
  END IF;

  IF v_row.attempts_count >= v_row.max_attempts THEN
    UPDATE otp_codes SET used_at = NOW() WHERE id = v_row.id;
    RETURN QUERY SELECT FALSE, 'MAX_ATTEMPTS_EXCEEDED'::TEXT, NULL::INT, NULL::TEXT;
    RETURN;
  END IF;

  v_otp_hash := encode(digest(p_otp_code, 'sha256'), 'hex');

  IF v_row.otp_hash <> v_otp_hash THEN
    UPDATE otp_codes
       SET attempts_count = attempts_count + 1
     WHERE id = v_row.id;

    IF (v_row.attempts_count + 1) >= v_row.max_attempts THEN
      UPDATE otp_codes SET used_at = NOW() WHERE id = v_row.id;
      RETURN QUERY SELECT FALSE, 'MAX_ATTEMPTS_EXCEEDED'::TEXT, NULL::INT, NULL::TEXT;
    ELSE
      RETURN QUERY SELECT FALSE, 'INVALID_OTP'::TEXT, NULL::INT, NULL::TEXT;
    END IF;
    RETURN;
  END IF;

  UPDATE otp_codes SET used_at = NOW() WHERE id = v_row.id;

  RETURN QUERY SELECT TRUE, NULL::TEXT, v_row.user_id, v_row.email;
END;
$$;

-- ============================================================
-- Part G: fn_resend_otp_code
-- ============================================================

CREATE OR REPLACE FUNCTION fn_resend_otp_code(p_mfa_token TEXT)
RETURNS TABLE(
  success BOOLEAN,
  error_code TEXT,
  raw_otp TEXT,
  new_mfa_token TEXT,
  email TEXT,
  first_name TEXT,
  purpose TEXT,
  payload JSONB
)
LANGUAGE plpgsql AS $$
DECLARE
  v_token_hash     TEXT;
  v_row            otp_codes%ROWTYPE;
  v_raw_otp        TEXT;
  v_new_mfa_token  TEXT;
  v_first_name     TEXT;
BEGIN
  v_token_hash := encode(digest(p_mfa_token, 'sha256'), 'hex');

  SELECT * INTO v_row
    FROM otp_codes
   WHERE mfa_token_hash = v_token_hash
     AND used_at IS NULL
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'TOKEN_INVALID'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::JSONB;
    RETURN;
  END IF;

  -- Enforce 60-second cooldown
  IF v_row.created_at > (NOW() - INTERVAL '60 seconds') THEN
    RETURN QUERY SELECT FALSE, 'COOLDOWN_ACTIVE'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::JSONB;
    RETURN;
  END IF;

  -- Mark old OTP as used/invalidated
  UPDATE otp_codes SET used_at = NOW() WHERE id = v_row.id;

  IF v_row.user_id IS NOT NULL THEN
    SELECT u.first_name INTO v_first_name FROM users u WHERE u.id = v_row.user_id;
  ELSIF v_row.payload IS NOT NULL AND v_row.payload ? 'first_name' THEN
    v_first_name := v_row.payload->>'first_name';
  END IF;

  v_raw_otp := LPAD(FLOOR(random() * 900000 + 100000)::TEXT, 6, '0');
  v_new_mfa_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO otp_codes (
    user_id,
    email,
    purpose,
    mfa_token_hash,
    otp_hash,
    payload,
    max_attempts,
    expires_at
  ) VALUES (
    v_row.user_id,
    v_row.email,
    v_row.purpose,
    encode(digest(v_new_mfa_token, 'sha256'), 'hex'),
    encode(digest(v_raw_otp, 'sha256'), 'hex'),
    v_row.payload,
    v_row.max_attempts,
    NOW() + INTERVAL '10 minutes'
  );

  RETURN QUERY SELECT TRUE, NULL::TEXT, v_raw_otp, v_new_mfa_token, v_row.email, v_first_name, v_row.purpose, v_row.payload;
END;
$$;

-- ============================================================
-- Part H: fn_set_user_2fa
-- ============================================================

CREATE OR REPLACE FUNCTION fn_set_user_2fa(
  p_user_id INT,
  p_enabled BOOLEAN,
  p_type TEXT DEFAULT 'email'
)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users
     SET is_2fa_enabled = p_enabled,
         two_factor_type = COALESCE(p_type, 'email')
   WHERE id = p_user_id;
END;
$$;

-- ============================================================
-- Part I: Update v_users_canonical
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
    is_2fa_enabled,
    two_factor_type,
    created_at,
    deleted_at
FROM users
WHERE deleted_at IS NULL;
