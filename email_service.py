import os
import logging
try:
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail
except Exception:
    SendGridAPIClient = None
    Mail = None

logger = logging.getLogger(__name__)


def send_email(recipient: str, subject: str, body: str):
    """Send email using SendGrid API. Requires env vars `SENDGRID_API_KEY` and `EMAIL_FROM`.

    Raises RuntimeError if SendGrid client not available or env vars missing; re-raises
    underlying exceptions to allow caller to log and return `email_sent: false`.
    """
    if SendGridAPIClient is None or Mail is None:
        raise RuntimeError('sendgrid package not installed')

    api_key = os.getenv('SENDGRID_API_KEY')
    sender = os.getenv('EMAIL_FROM')
    if not api_key or not sender:
        raise RuntimeError('SENDGRID_API_KEY or EMAIL_FROM not configured')

    try:
        sg = SendGridAPIClient(api_key)
        message = Mail(
            from_email=sender,
            to_emails=recipient,
            subject=subject,
            plain_text_content=body,
        )
        sg.send(message)
    except Exception:
        logger.exception('Failed to send email via SendGrid to %s', recipient)
        raise
