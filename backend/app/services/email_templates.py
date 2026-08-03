# email_templates.py
# All auth email generators return: (subject: str, text_body: str, html_body: str)
# Notification helpers return plain text strings (used in notification_service).

# ── Shared design tokens ──────────────────────────────────────────────────────

_BRAND_BG       = "#0f1117"
_CARD_BG        = "#16181f"
_BORDER         = "#2a2d36"
_PRIMARY        = "#6366f1"       # indigo-500
_PRIMARY_DARK   = "#4f52c9"
_TEXT           = "#e2e4eb"
_TEXT_MUTED     = "#8b8fa8"
_TEXT_LIGHT     = "#ffffff"
_SUCCESS        = "#22c55e"
_WARNING        = "#f59e0b"
_DANGER         = "#ef4444"
_FONT           = "'Inter', 'Segoe UI', Arial, sans-serif"


def _base_layout(preheader: str, body_html: str) -> str:
    """Wraps body_html in a dark, minimal, responsive email shell."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KAIO</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    body, table, td, a {{ -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }}
    table, td {{ mso-table-lspace:0pt; mso-table-rspace:0pt; }}
    img {{ -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }}
    body {{ margin:0; padding:0; background-color:{_BRAND_BG}; font-family:{_FONT}; }}
    a {{ color:{_PRIMARY}; text-decoration:none; }}
    .btn:hover {{ background-color:{_PRIMARY_DARK} !important; }}
  </style>
</head>
<body style="margin:0;padding:0;background-color:{_BRAND_BG};">
  <!-- preheader -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">{preheader}&nbsp;‌&nbsp;‌&nbsp;‌</div>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{_BRAND_BG};padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

          <!-- Logo / wordmark -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:{_PRIMARY};border-radius:10px;padding:8px 14px;">
                    <span style="font-family:{_FONT};font-size:17px;font-weight:700;color:{_TEXT_LIGHT};letter-spacing:-0.3px;">KAIO</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:{_CARD_BG};border-radius:16px;border:1px solid {_BORDER};padding:40px 36px;">
              {body_html}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="font-family:{_FONT};font-size:12px;color:{_TEXT_MUTED};margin:0;line-height:1.6;">
                KAIO Workspace &mdash; Project &amp; Team Management<br/>
                You're receiving this because your account requested this action.<br/>
                If you didn't, you can safely ignore this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _primary_button(label: str, url: str) -> str:
    return f"""<table cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 0;">
  <tr>
    <td align="center" style="border-radius:10px;background-color:{_PRIMARY};">
      <a href="{url}" class="btn"
         style="font-family:{_FONT};font-size:15px;font-weight:600;color:{_TEXT_LIGHT};
                text-decoration:none;display:inline-block;padding:14px 32px;
                border-radius:10px;background-color:{_PRIMARY};">
        {label}
      </a>
    </td>
  </tr>
</table>"""


def _otp_block(code: str) -> str:
    digits = "".join(
        f'<span style="display:inline-block;width:44px;height:54px;line-height:54px;'
        f'text-align:center;background-color:{_BRAND_BG};border:1px solid {_BORDER};'
        f'border-radius:10px;font-family:{_FONT};font-size:26px;font-weight:700;'
        f'color:{_TEXT_LIGHT};margin:0 4px;">{ch}</span>'
        for ch in code
    )
    return f"""<div style="text-align:center;margin:28px 0;">{digits}</div>"""


def _divider() -> str:
    return f'<div style="border-top:1px solid {_BORDER};margin:28px 0;"></div>'


def _heading(text: str) -> str:
    return f'<h1 style="font-family:{_FONT};font-size:22px;font-weight:700;color:{_TEXT_LIGHT};margin:0 0 8px;letter-spacing:-0.4px;">{text}</h1>'


def _subtext(text: str, color: str = None) -> str:
    c = color or _TEXT_MUTED
    return f'<p style="font-family:{_FONT};font-size:14px;color:{c};margin:0;line-height:1.65;">{text}</p>'


def _small_label(text: str) -> str:
    return f'<p style="font-family:{_FONT};font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:{_TEXT_MUTED};margin:0 0 4px;">{text}</p>'


def _info_row(label: str, value: str) -> str:
    return f"""<tr>
  <td style="padding:10px 0;border-bottom:1px solid {_BORDER};">
    <span style="font-family:{_FONT};font-size:12px;color:{_TEXT_MUTED};">{label}</span>
    <span style="font-family:{_FONT};font-size:14px;font-weight:600;color:{_TEXT};display:block;margin-top:2px;">{value}</span>
  </td>
</tr>"""


# ── Auth Email Templates ──────────────────────────────────────────────────────


def generate_password_reset_email(first_name: str, reset_url: str) -> tuple[str, str, str]:
    subject = "Reset your KAIO password"

    text = f"""Hi {first_name},

You requested a password reset for your KAIO account.

Reset link (expires in 1 hour):
{reset_url}

If you didn't request this, ignore this email — your password won't change.

— KAIO Team
"""

    body_html = f"""
{_heading("Reset your password")}
<p style="font-family:{_FONT};font-size:15px;color:{_TEXT_MUTED};margin:10px 0 0;line-height:1.6;">
  Hi {first_name}, we received a request to reset the password for your KAIO account.
  Click the button below to choose a new password.
</p>

{_primary_button("Reset Password", reset_url)}

{_divider()}

<table cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:{_BRAND_BG};border-radius:10px;padding:16px 20px;border:1px solid {_BORDER};">
  <tr>
    <td>
      {_small_label("Reset link")}
      <p style="font-family:monospace;font-size:12px;color:{_TEXT_MUTED};margin:4px 0 0;word-break:break-all;">{reset_url}</p>
    </td>
  </tr>
</table>

<p style="font-family:{_FONT};font-size:13px;color:{_TEXT_MUTED};margin:20px 0 0;line-height:1.6;">
  ⏰ This link expires in <strong style="color:{_WARNING};">1 hour</strong>.<br/>
  🔒 If you didn't request a password reset, you can safely ignore this email.
</p>
"""

    html = _base_layout(f"Reset your KAIO password, {first_name}.", body_html)
    return subject, text, html


def generate_email_verification_email(first_name: str, verify_url: str) -> tuple[str, str, str]:
    subject = "Verify your KAIO email address"

    text = f"""Hi {first_name},

Please verify your email address to activate your KAIO account.

Verification link (expires in 24 hours):
{verify_url}

— KAIO Team
"""

    body_html = f"""
{_heading("Confirm your email address")}
<p style="font-family:{_FONT};font-size:15px;color:{_TEXT_MUTED};margin:10px 0 0;line-height:1.6;">
  Hi {first_name}, you're almost there. Click below to verify your email and activate your KAIO workspace.
</p>

{_primary_button("Verify Email Address", verify_url)}

{_divider()}

<p style="font-family:{_FONT};font-size:13px;color:{_TEXT_MUTED};margin:0;line-height:1.6;">
  ⏰ This link expires in <strong style="color:{_WARNING};">24 hours</strong>.<br/>
  If you didn't create a KAIO account, you can safely ignore this email.
</p>
"""

    html = _base_layout(f"Verify your email to activate KAIO.", body_html)
    return subject, text, html


def generate_otp_email(first_name: str, otp_code: str, purpose_title: str = "Verification Code", expiry_minutes: int = 10) -> tuple[str, str, str]:
    subject = f"[{otp_code}] Your KAIO verification code"
    greeting_name = first_name if first_name else "there"

    text = f"""Hi {greeting_name},

Your KAIO {purpose_title} code is:

  {otp_code}

This code expires in {expiry_minutes} minutes.
Never share this code with anyone.

— KAIO Team
"""

    body_html = f"""
{_heading(f"{purpose_title}")}
<p style="font-family:{_FONT};font-size:15px;color:{_TEXT_MUTED};margin:10px 0 0;line-height:1.6;">
  Hi {greeting_name}, use the code below to complete your verification.
  It expires in <strong style="color:{_WARNING};">{expiry_minutes} minutes</strong>.
</p>

{_otp_block(otp_code)}

{_divider()}

<p style="font-family:{_FONT};font-size:13px;color:{_TEXT_MUTED};margin:0;line-height:1.6;">
  🔒 <strong style="color:{_TEXT};">Never share this code.</strong>
  KAIO support will never ask for your verification code.<br/>
  If you didn't request this, please secure your account immediately.
</p>
"""

    html = _base_layout(f"Your KAIO code: {otp_code}", body_html)
    return subject, text, html


# ── Notification Templates (plain text only, used internally) ─────────────────


def task_assigned_template(task_title: str, board_name: str, assigned_by_name: str) -> str:
    return f"""You have been assigned a new task.

Task: {task_title}
Board: {board_name}
Assigned by: {assigned_by_name}

Open your KAIO workspace to view the task and get started.

— KAIO Team
"""


def task_assignment_changed_template(task_title: str, assigned_user_name: str) -> str:
    return f"""A task assignment has been updated.

Task: {task_title}
New Assignee: {assigned_user_name}

Open your KAIO workspace to see the latest updates.

— KAIO Team
"""


def task_status_changed_template(task_title: str, old_status: str, new_status: str, changed_by_name: str) -> str:
    return f"""A task status was updated.

Task: {task_title}
Status: {old_status} → {new_status}
Updated by: {changed_by_name}

Visit your KAIO workspace to review the latest progress.

— KAIO Team
"""


def task_comment_added_template(task_title: str, commenter_name: str, comment: str) -> str:
    return f"""New comment on a task you follow.

Task: {task_title}
Comment by: {commenter_name}

"{comment}"

Open your KAIO workspace to reply.

— KAIO Team
"""