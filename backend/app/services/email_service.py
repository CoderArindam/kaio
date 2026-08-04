import smtplib
import logging
from email.message import EmailMessage
from typing import Optional
import httpx

from app.config.settings import settings

logger = logging.getLogger(__name__)


def send_email(to_email: str, subject: str, body_text: str, html_content: Optional[str] = None) -> bool:
    api_key = settings.RESEND_API_KEY
    sender_email = settings.RESEND_SENDER_EMAIL or "onboarding@resend.dev"

    # 1. Primary: Send via Resend REST API
    if api_key:
        try:
            url = "https://api.resend.com/emails"
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "from": sender_email,
                "to": [to_email],
                "subject": subject,
                "text": body_text,
            }
            if html_content:
                payload["html"] = html_content

            with httpx.Client(timeout=10.0) as client:
                response = client.post(
                    url,
                    headers=headers,
                    json=payload
                )

            if response.status_code in (200, 201):
                logger.info(f"Email sent via Resend API to {to_email}")
                return True
            else:
                logger.error(f"Resend email sending failed (status {response.status_code}): {response.text}")
        except Exception as e:
            logger.error(f"Resend API error when sending email to {to_email}: {e}")

    # 2. Secondary Fallback: SMTP
    if settings.SMTP_EMAIL and settings.SMTP_PASSWORD:
        try:
            logger.info(f"Attempting to send email via Gmail SMTP to {to_email}...")
            msg = EmailMessage()
            msg["From"] = f"KAIO <{settings.SMTP_EMAIL}>"
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.set_content(body_text)

            if html_content:
                msg.add_alternative(html_content, subtype="html")

            with smtplib.SMTP("smtp.gmail.com", 587, timeout=10.0) as server:
                server.starttls()
                server.login(settings.SMTP_EMAIL, settings.SMTP_PASSWORD)
                server.send_message(msg)

            logger.info(f"Email successfully sent via SMTP to {to_email}")
            return True
        except Exception as e:
            logger.error(f"SMTP email sending failed to {to_email}: {e}")
    else:
        logger.warning(
            f"SMTP credentials missing. SMTP_EMAIL configured: {bool(settings.SMTP_EMAIL)}, "
            f"SMTP_PASSWORD configured: {bool(settings.SMTP_PASSWORD)}"
        )

    logger.warning("No working email credentials configured or all email methods failed. Skipping email.")
    return False