import os
import logging
try:
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail
except Exception:
    SendGridAPIClient = None
    Mail = None

logger = logging.getLogger(__name__)


def send_email(recipient: str, subject: str = None, body: str = None, template_id: str = None, dynamic_template_data: dict = None):
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
        # Si se proporciona template_id, usar plantilla dinámica
        if template_id:
            print('Sending with template_id', template_id)
            message = Mail(from_email=sender, to_emails=recipient)
            # algunos helpers aceptan template_id directamente, pero por compatibilidad lo asignamos
            message.template_id = template_id
            if dynamic_template_data:
                message.dynamic_template_data = dynamic_template_data
        else:
            message = Mail(
                from_email=sender,
                to_emails=recipient,
                subject=subject,
                plain_text_content=body,
            )
        # Log mode
        try:
            print('send_email mode', 'template' if template_id else 'plain', 'to=', recipient, 'subject=', subject, 'template_id=', template_id)
        except Exception:
            pass
        try:
            response = sg.send(message)
            try:
                # SendGrid response tiene status_code y body en algunas versiones
                status_code = getattr(response, 'status_code', None)
                body = getattr(response, 'body', None)
                headers = getattr(response, 'headers', None)
                print('SendGrid response', status_code)
                print('SendGrid body', body)
                print('SendGrid headers', headers)
                logger.info('SendGrid send response status_code=%s', status_code)
            except Exception:
                print('SendGrid send returned (raw):', response)
                logger.info('SendGrid send returned: %s', response)
        except Exception as e:
            print('SendGrid exception', str(e))
            logger.exception('Failed to send email via SendGrid to %s', recipient)
            raise
    except Exception:
        logger.exception('Failed to send email via SendGrid to %s', recipient)
        raise
