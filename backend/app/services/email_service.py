import smtplib
import logging
from email.message import EmailMessage
from typing import Optional
import httpx

from app.config.settings import settings

logger = logging.getLogger(__name__)


def send_email(to_email: str, subject: str, body_text: str, html_content: Optional[str] = None) -> bool:
    api_key = settings.MAILJET_API_KEY
    secret_key = settings.MAILJET_SECRET_KEY
    sender_email = settings.MAILJET_SENDER_EMAIL or settings.SMTP_EMAIL or "coderarindam@gmail.com"

    # 1. Primary: Send via Mailjet REST API (v3.1)
    if api_key and secret_key:
        try:
            url = "https://api.mailjet.com/v3.1/send"
            message_data = {
                "From": {
                    "Email": sender_email,
                    "Name": "KAIO Workspace"
                },
                "To": [
                    {
                        "Email": to_email
                    }
                ],
                "Subject": subject,
                "TextPart": body_text,
            }
            if html_content:
                message_data["HTMLPart"] = html_content

            payload = {"Messages": [message_data]}

            with httpx.Client(timeout=10.0) as client:
                response = client.post(
                    url,
                    auth=(api_key, secret_key),
                    json=payload
                )

            if response.status_code in (200, 201):
                logger.info(f"Email sent via Mailjet REST API to {to_email}")
                return True
            else:
                logger.error(f"Mailjet email sending failed (status {response.status_code}): {response.text}")
        except Exception as e:
            logger.error(f"Mailjet API error when sending email to {to_email}: {e}")

    # 2. Secondary Fallback: SMTP
    if settings.SMTP_EMAIL and settings.SMTP_PASSWORD:
        try:
            msg = EmailMessage()
            msg["From"] = settings.SMTP_EMAIL
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.set_content(body_text)

            if html_content:
                msg.add_alternative(html_content, subtype="html")

            with smtplib.SMTP("smtp.gmail.com", 587) as server:
                server.starttls()
                server.login(settings.SMTP_EMAIL, settings.SMTP_PASSWORD)
                server.send_message(msg)

            logger.info(f"Email sent via SMTP fallback to {to_email}")
            return True
        except Exception as e:
            logger.error(f"SMTP email fallback failed: {e}")

    logger.warning("No email credentials configured or all email methods failed. Skipping email.")
    return False