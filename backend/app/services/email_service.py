import smtplib
import logging
import socket
from email.message import EmailMessage
from typing import Optional
import httpx

from app.config.settings import settings

logger = logging.getLogger(__name__)


def _send_via_gmail_smtp(to_email: str, subject: str, body_text: str, html_content: Optional[str] = None) -> bool:
    msg = EmailMessage()
    msg["From"] = f"KAIO <{settings.SMTP_EMAIL}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body_text)

    if html_content:
        msg.add_alternative(html_content, subtype="html")

    # Force IPv4 resolution for smtp.gmail.com to bypass Render IPv6 unreachable ([Errno 101])
    orig_getaddrinfo = socket.getaddrinfo

    def ipv4_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
        if host == "smtp.gmail.com":
            family = socket.AF_INET
        return orig_getaddrinfo(host, port, family, type, proto, flags)

    socket.getaddrinfo = ipv4_getaddrinfo
    try:
        # Attempt 1: Port 587 with STARTTLS
        try:
            logger.info(f"Attempting Gmail SMTP (Port 587 TLS) to {to_email}...")
            with smtplib.SMTP("smtp.gmail.com", 587, timeout=10.0) as server:
                server.starttls()
                server.login(settings.SMTP_EMAIL, settings.SMTP_PASSWORD)
                server.send_message(msg)
            logger.info(f"Email successfully sent via Gmail SMTP (Port 587) to {to_email}")
            return True
        except Exception as e587:
            logger.warning(f"Gmail SMTP Port 587 failed ({e587}), trying Port 465 SSL...")

        # Attempt 2: Port 465 with SSL
        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10.0) as server:
                server.login(settings.SMTP_EMAIL, settings.SMTP_PASSWORD)
                server.send_message(msg)
            logger.info(f"Email successfully sent via Gmail SMTP (Port 465 SSL) to {to_email}")
            return True
        except Exception as e465:
            logger.error(f"Gmail SMTP failed on ports 587 and 465 for {to_email}: 587 err={e587}, 465 err={e465}")
            return False
    finally:
        socket.getaddrinfo = orig_getaddrinfo


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

    # 2. Secondary Fallback: Gmail SMTP
    if settings.SMTP_EMAIL and settings.SMTP_PASSWORD:
        return _send_via_gmail_smtp(to_email, subject, body_text, html_content)
    else:
        logger.warning(
            f"SMTP credentials missing. SMTP_EMAIL configured: {bool(settings.SMTP_EMAIL)}, "
            f"SMTP_PASSWORD configured: {bool(settings.SMTP_PASSWORD)}"
        )

    logger.warning("No working email credentials configured or all email methods failed. Skipping email.")
    return False