-- 070_skip_registration_otp.sql
-- Allow skipping OTP verification for organization registration

CREATE OR REPLACE FUNCTION fn_skip_registration_otp(
  p_mfa_token TEXT
)
RETURNS TABLE(success BOOLEAN, error_code TEXT, payload JSONB, email TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_token_hash  TEXT;
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

  -- Mark OTP as used
  UPDATE otp_codes SET used_at = NOW() WHERE id = v_row.id;

  RETURN QUERY SELECT TRUE, NULL::TEXT, v_row.payload, v_row.email::TEXT;
END;
$$;
