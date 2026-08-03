-- 069_fix_otp_type_mismatch.sql
-- Fix: asyncpg DatatypeMismatchError: VARCHAR(255)/VARCHAR(64) columns returned
-- where TEXT is declared in function return type.
-- Solution: Cast all VARCHAR columns to TEXT in RETURN QUERY statements.

-- ============================================================
-- Fix fn_verify_registration_otp
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

  UPDATE otp_codes SET used_at = NOW() WHERE id = v_row.id;

  -- Cast VARCHAR columns to TEXT to match return type declaration
  RETURN QUERY SELECT TRUE, NULL::TEXT, v_row.payload, v_row.email::TEXT;
END;
$$;


-- ============================================================
-- Fix fn_verify_otp_code
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

  -- Cast VARCHAR columns to TEXT to match return type declaration
  RETURN QUERY SELECT TRUE, NULL::TEXT, v_row.user_id, v_row.email::TEXT;
END;
$$;


-- ============================================================
-- Fix fn_resend_otp_code
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

  IF v_row.created_at > (NOW() - INTERVAL '60 seconds') THEN
    RETURN QUERY SELECT FALSE, 'COOLDOWN_ACTIVE'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::JSONB;
    RETURN;
  END IF;

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

  -- Cast VARCHAR columns to TEXT to match return type declaration
  RETURN QUERY SELECT TRUE, NULL::TEXT, v_raw_otp, v_new_mfa_token, v_row.email::TEXT, v_first_name, v_row.purpose::TEXT, v_row.payload;
END;
$$;


-- ============================================================
-- Fix fn_create_registration_otp (mfa_token_hash is VARCHAR(64))
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
  UPDATE otp_codes
     SET used_at = NOW()
   WHERE LOWER(email) = LOWER(p_email)
     AND purpose = 'ORG_REGISTRATION'
     AND used_at IS NULL;

  v_raw_otp := LPAD(FLOOR(random() * 900000 + 100000)::TEXT, 6, '0');
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

  -- Both are local TEXT variables, no cast needed
  RETURN QUERY SELECT v_raw_otp, v_mfa_token;
END;
$$;
