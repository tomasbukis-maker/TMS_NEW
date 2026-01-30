"""
Automatiniai pranešimai apie užsakymus
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from .models import Order


@receiver(post_save, sender=Order)
def send_new_order_notification(sender, instance: Order, created: bool, **kwargs):
    """
    Siunčia pranešimą apie naują užsakymą, jei įjungti nustatymai
    """
    if not created:
        return  # Siunčiame tik naujiems užsakymams

    if not instance.order_number:
        return  # Siunčiame tik jei turi numerį

    try:
        from apps.settings.models import NotificationSettings

        # Gauname nustatymus
        notification_settings = NotificationSettings.objects.first()
        if not notification_settings or not notification_settings.email_notify_new_order_enabled:
            return  # Pranešimai išjungti

        # Nustatome gavėją pagal nustatymus
        recipient_type = notification_settings.email_notify_new_order_recipient

        recipients = []
        if recipient_type in ['client', 'both']:
            # Siunčiame klientui
            if instance.client and instance.client.contact_person and instance.client.contact_person.email:
                recipients.append({
                    'email': instance.client.contact_person.email,
                    'name': instance.client.contact_person.first_name or instance.client.name or 'Klientas'
                })

        if recipient_type in ['manager', 'both']:
            # Siunčiame vadybininkui (naudojame sistemos el. paštą)
            if notification_settings.smtp_from_email:
                recipients.append({
                    'email': notification_settings.smtp_from_email,
                    'name': 'Vadybininkas'
                })

        if not recipients:
            return  # Nėra kam siųsti

        # Siunčiame laišką kiekvienam gavėjui
        for recipient in recipients:
            try:
                subject = f'Naujas užsakymas {instance.order_number}'

                # Gauname kliento informaciją
                client_name = instance.client.name if instance.client else 'N/A'

                # Sudarome maršruto informaciją
                def format_route(from_country, from_city, from_address, to_country, to_city, to_address):
                    """Formatuoja maršruto informaciją iš turimų duomenų"""
                    route_from_parts = []
                    route_to_parts = []

                    if from_country and from_country.strip():
                        route_from_parts.append(from_country.strip())
                    if from_city and from_city.strip():
                        route_from_parts.append(from_city.strip())
                    if from_address and from_address.strip():
                        route_from_parts.append(from_address.strip())

                    if to_country and to_country.strip():
                        route_to_parts.append(to_country.strip())
                    if to_city and to_city.strip():
                        route_to_parts.append(to_city.strip())
                    if to_address and to_address.strip():
                        route_to_parts.append(to_address.strip())

                    route_from = ' - '.join(route_from_parts) if route_from_parts else 'N/A'
                    route_to = ' - '.join(route_to_parts) if route_to_parts else 'N/A'

                    return route_from, route_to

                route_from, route_to = format_route(
                    instance.route_from_country,
                    instance.route_from_city,
                    instance.route_from_address,
                    instance.route_to_country,
                    instance.route_to_city,
                    instance.route_to_address
                )

                # Paprastas tekstinis turinys
                body_text = f"""
                Sukurtas naujas užsakymas.

                Užsakymo numeris: {instance.order_number}
                Klientas: {client_name}
                Iš: {route_from}
                Į: {route_to}

                Peržiūrėti sistemą: http://localhost:3000/orders/{instance.id}
                """

                # HTML turinys
                body_html = f"""
                <h2>Naujas užsakymas</h2>
                <p>Sukurtas naujas užsakymas sistemoje.</p>

                <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Užsakymo numeris:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{instance.order_number}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Klientas:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{client_name}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Iš:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{route_from}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Į:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{route_to}</td></tr>
                </table>

                <p><a href="http://localhost:3000/orders/{instance.id}">Peržiūrėti užsakymą sistemoje</a></p>
                """

                # Siunčiame laišką tiesiogiai naudojant Django send_mail su NotificationSettings
                from django.core.mail import send_mail, EmailMessage
                from django.conf import settings
                import smtplib
                from email.mime.text import MIMEText
                from email.mime.multipart import MIMEMultipart

                # Naudojame jau gautus notification_settings

                # Sukuriame SMTP connection
                try:
                    if notification_settings.smtp_use_tls:
                        server = smtplib.SMTP(notification_settings.smtp_host, notification_settings.smtp_port)
                        server.starttls()
                    else:
                        server = smtplib.SMTP_SSL(notification_settings.smtp_host, notification_settings.smtp_port)

                    server.login(notification_settings.smtp_username, notification_settings.smtp_password or '')

                    # Sukuriame laišką
                    msg = MIMEMultipart('alternative')
                    msg['Subject'] = subject
                    msg['From'] = notification_settings.smtp_from_email
                    msg['To'] = recipient['email']

                    # Pridedame tekstinį turinį
                    text_part = MIMEText(body_text, 'plain', 'utf-8')
                    msg.attach(text_part)

                    # Pridedame HTML turinį
                    if body_html:
                        html_part = MIMEText(body_html, 'html', 'utf-8')
                        msg.attach(html_part)

                    # Siunčiame
                    server.sendmail(notification_settings.smtp_from_email, recipient['email'], msg.as_string())
                    server.quit()

                    # Išsaugome į EmailLog
                    from apps.mail.models import EmailLog
                    EmailLog.objects.create(
                        email_type='order',
                        subject=subject,
                        recipient_email=recipient['email'],
                        recipient_name=recipient['name'],
                        body_text=body_text,
                        body_html=body_html,
                        status=EmailLog.Status.SENT,
                        related_order_id=instance.id,
                        related_partner_id=instance.client.id if instance.client else None,
                        metadata={
                            'order_number': instance.order_number,
                            'notification_type': 'new_order',
                            'recipient_type': recipient_type
                        }
                    )

                except Exception as e:
                    # Log'iname klaidą
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.error(f"Klaida siunčiant naujų užsakymų pranešimą: {e}", exc_info=True)

                    # Išsaugome klaidą į EmailLog
                    from apps.mail.models import EmailLog
                    EmailLog.objects.create(
                        email_type='order',
                        subject=subject,
                        recipient_email=recipient['email'],
                        recipient_name=recipient['name'],
                        body_text=body_text,
                        body_html=body_html,
                        status=EmailLog.Status.FAILED,
                        error_message=str(e),
                        related_order_id=instance.id,
                        related_partner_id=instance.client.id if instance.client else None,
                        metadata={
                            'order_number': instance.order_number,
                            'notification_type': 'new_order',
                            'recipient_type': recipient_type
                        }
                    )

            except Exception as e:
                # Log'iname klaidą, bet netrukdome pagrindiniam procesui
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Klaida siunčiant naujų užsakymų pranešimą: {e}", exc_info=True)

    except Exception as e:
        # Log'iname klaidą
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Klaida naujų užsakymų pranešimų sistemoje: {e}", exc_info=True)
