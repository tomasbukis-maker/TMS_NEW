"""
Email siuntimo wrapper su istorijos įrašymu
"""
from django.core.mail import send_mail, EmailMessage
from django.conf import settings
from django.utils import timezone
from .models import EmailLog


def get_test_mode_recipient():
    """
    Gauna testavimo režimo adresą iš NotificationSettings.
    Jei testavimo režimas neįjungtas arba adresas tuščias, grąžina None.
    """
    try:
        from apps.settings.models import NotificationSettings
        notification_settings = NotificationSettings.load()
        if notification_settings.email_test_mode:
            test_recipient = notification_settings.email_test_recipient
            if test_recipient:
                test_recipient = str(test_recipient).strip()
                # Patikrinti, ar email nėra tuščias ir turi @ simbolį
                if test_recipient and len(test_recipient) > 0 and '@' in test_recipient:
                    return test_recipient
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error getting test mode recipient: {e}")
    return None


def send_email_with_logging(
    email_type: str,
    subject: str,
    message: str,
    recipient_email: str,
    recipient_name: str = '',
    html_message: str = None,
    related_order_id: int = None,
    related_invoice_id: int = None,
    related_expedition_id: int = None,
    related_partner_id: int = None,
    sent_by=None,
    metadata: dict = None
):
    """
    Siunčia el. laišką ir išsaugo į istoriją
    
    Args:
        email_type: Email tipas (reminder, order, invoice, expedition, custom)
        subject: Laiško tema
        message: Laiško tekstas (plain text)
        recipient_email: Gavėjo el. pašto adresas
        recipient_name: Gavėjo vardas (optional)
        html_message: HTML turinys (optional)
        related_order_id: Susietas užsakymo ID (optional)
        related_invoice_id: Susieta sąskaitos ID (optional)
        related_expedition_id: Susieta ekspedicijos ID (optional)
        related_partner_id: Susietas partnerio ID (optional)
        sent_by: User objektas, kuris siuntė (optional)
        metadata: Papildomi duomenys (optional)
    
    Returns:
        dict su 'success', 'email_log_id', 'message' arba 'error'
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # Patikrinti recipient_email
    if recipient_email is None:
        return {
            'success': False,
            'error': 'Nenurodytas el. pašto adresas'
        }
    
    recipient_email = str(recipient_email).strip()
    
    if not recipient_email:
        return {
            'success': False,
            'error': 'El. pašto adresas negali būti tuščias'
        }
    
    # Patikrinti testavimo režimą
    original_recipient = recipient_email
    original_recipient_valid = isinstance(original_recipient, str) and original_recipient.strip() and '@' in original_recipient.strip()
    test_recipient = get_test_mode_recipient()
    
    # Jei testavimo režimas įjungtas arba original_recipient nėra validus, naudoti testavimo adresą
    if test_recipient or not original_recipient_valid:
        if test_recipient:
            original_recipient_str = original_recipient if original_recipient_valid else 'nežinomas'
            recipient_email = str(test_recipient).strip()
            
            if not recipient_email or '@' not in recipient_email:
                logger.error(f"Testavimo adresas neteisingas: {recipient_email}")
                return {
                    'success': False,
                    'error': f'Testavimo adresas yra neteisingas: "{recipient_email}"'
            }
            
        subject = f"[TEST] {subject} (Originalus gavėjas: {original_recipient_str})"
        message = f"[TESTAVIMO REŽIMAS]\nOriginalus gavėjas: {original_recipient_str}\n\n{message}"
    else:
            from apps.settings.models import NotificationSettings
            notification_settings = NotificationSettings.load()
            
            if notification_settings.email_test_mode:
                recipient_email = 'info@hotmail.lt'
            else:
                logger.error(f"El. pašto adresas neteisingas: {original_recipient}")
                return {
                    'success': False,
                    'error': f'El. pašto adresas yra neteisingas: "{original_recipient}"'
                }
    
    # Galutinis patikrinimas prieš EmailLog
    recipient_email = recipient_email.strip()
    
    if not recipient_email or '@' not in recipient_email:
        logger.error(f"El. pašto adresas neteisingas: {recipient_email}")
        return {
            'success': False,
            'error': f'El. pašto adresas yra neteisingas: "{recipient_email}"'
        }
    
    # Nustatyti log'ui naudotiną email (originalus, jei validus, kitaip recipient_email)
    log_recipient_email = original_recipient if original_recipient_valid else recipient_email
    if not log_recipient_email or not isinstance(log_recipient_email, str) or not log_recipient_email.strip():
        log_recipient_email = recipient_email
    
    # Sukurti log įrašą (su originaliu gavėju arba testavimo adresu)
    email_log = EmailLog.objects.create(
        email_type=email_type,
        subject=subject,
        recipient_email=log_recipient_email,
        recipient_name=recipient_name,
        body_text=message,
        body_html=html_message or '',
        related_order_id=related_order_id,
        related_invoice_id=related_invoice_id,
        related_expedition_id=related_expedition_id,
        related_partner_id=related_partner_id,
        sent_by=sent_by,
        metadata=metadata or {},
        status=EmailLog.Status.PENDING
    )
    
    try:
        # Galutinis patikrinimas prieš siuntimą
        if not recipient_email or not recipient_email.strip():
            email_log.status = EmailLog.Status.FAILED
            email_log.error_message = f'El. pašto adresas negali būti tuščias: "{recipient_email}"'
            email_log.save(update_fields=['status', 'error_message'])
            return {
                'success': False,
                'email_log_id': email_log.id,
                'error': f'El. pašto adresas negali būti tuščias: "{recipient_email}"'
            }
        
        # Galutinis patikrinimas - užtikrinti, kad recipient_email yra validus
        if not recipient_email:
            error_msg = 'El. pašto adresas negali būti None arba tuščias'
            email_log.status = EmailLog.Status.FAILED
            email_log.error_message = error_msg
            email_log.save(update_fields=['status', 'error_message'])
            return {
                'success': False,
                'email_log_id': email_log.id,
                'error': error_msg
            }
        
        # Konvertuoti į string ir išvalyti
        recipient_email = str(recipient_email).strip()
        
        # PASKUTINIS PATIKRINIMAS PRIEŠ SIUNTIMĄ - užtikrinti, kad email tikrai nėra tuščias
        if not recipient_email or len(recipient_email) == 0:
            error_msg = f'El. pašto adresas negali būti tuščias stringas: "{recipient_email}"'
            email_log.status = EmailLog.Status.FAILED
            email_log.error_message = error_msg
            email_log.save(update_fields=['status', 'error_message'])
            return {
                'success': False,
                'email_log_id': email_log.id,
                'error': error_msg
            }
        
        # Patikrinti, ar email turi @ simbolį
        if '@' not in recipient_email:
            error_msg = f'El. pašto adresas neturi @ simbolio: "{recipient_email}"'
            email_log.status = EmailLog.Status.FAILED
            email_log.error_message = error_msg
            email_log.save(update_fields=['status', 'error_message'])
            return {
                'success': False,
                'email_log_id': email_log.id,
                'error': error_msg
            }
        
        # Jei vis dar tuščias (nors turėtų nebe būti), naudoti testavimo adresą
        if not recipient_email or recipient_email == '':
            from apps.settings.models import NotificationSettings
            notification_settings = NotificationSettings.load()
            if notification_settings.email_test_mode:
                recipient_email = notification_settings.email_test_recipient or 'info@hotmail.lt'
            else:
                error_msg = 'El. pašto adresas negali būti tuščias'
                email_log.status = EmailLog.Status.FAILED
                email_log.error_message = error_msg
                email_log.save(update_fields=['status', 'error_message'])
                return {
                    'success': False,
                    'email_log_id': email_log.id,
                    'error': error_msg
                }
        
        # Nustatyti from_email (naudojamas tik su send_mail, ne su EmailMessage)
        from_email = settings.DEFAULT_FROM_EMAIL
        email_host_user = getattr(settings, 'EMAIL_HOST_USER', '')
        
        if not from_email or not isinstance(from_email, str) or not from_email.strip() or '@' not in from_email.strip():
            if email_host_user and isinstance(email_host_user, str) and email_host_user.strip() and '@' in email_host_user.strip():
                from_email = email_host_user.strip()
            else:
                error_msg = 'El. pašto siuntimas negalimas: nėra nustatytas DEFAULT_FROM_EMAIL arba EMAIL_HOST_USER'
                logger.error(error_msg)
                email_log.status = EmailLog.Status.FAILED
                email_log.error_message = error_msg
                email_log.save(update_fields=['status', 'error_message'])
                return {
                    'success': False,
                    'email_log_id': email_log.id,
                    'error': error_msg
                }
        
        # Siųsti el. laišką (į testavimo adresą, jei režimas įjungtas)
        send_mail(
            subject=subject,
            message=message,
            from_email=from_email,
            recipient_list=[recipient_email],
            html_message=html_message,
            fail_silently=False,
        )
        
        # Atnaujinti statusą
        email_log.status = EmailLog.Status.SENT
        email_log.sent_at = timezone.now()
        email_log.save(update_fields=['status', 'sent_at'])
        
        # Registruoti veiksmą ActivityLog
        try:
            from apps.core.services.activity_log_service import ActivityLogService
            from apps.core.models import ActivityLog
            
            # Gauti susijusį objektą
            content_object = None
            if related_order_id:
                from apps.orders.models import Order
                try:
                    content_object = Order.objects.get(id=related_order_id)
                except Order.DoesNotExist:
                    pass
            elif related_invoice_id:
                from apps.invoices.models import SalesInvoice, PurchaseInvoice
                try:
                    content_object = SalesInvoice.objects.filter(id=related_invoice_id).first()
                    if not content_object:
                        content_object = PurchaseInvoice.objects.filter(id=related_invoice_id).first()
                except:
                    pass
            elif related_partner_id:
                from apps.partners.models import Partner
                try:
                    content_object = Partner.objects.get(id=related_partner_id)
                except Partner.DoesNotExist:
                    pass
            
            ActivityLogService.log_action(
                action_type=ActivityLog.ActionType.EMAIL_SENT,
                description=f'El. laiškas "{subject}" išsiųstas į {recipient_email}',
                user=sent_by,
                content_object=content_object,
                metadata={
                    'email_type': email_type,
                    'subject': subject,
                    'recipient_email': recipient_email,
                    'recipient_name': recipient_name,
                    'related_order_id': related_order_id,
                    'related_invoice_id': related_invoice_id,
                    'related_partner_id': related_partner_id,
                    'email_log_id': email_log.id,
                },
                request=None  # Email siuntimas gali vykti background task'uose, todėl request gali būti None
            )
        except Exception as e:
            logger.warning(f"Failed to log email sending to ActivityLog: {e}")
        
        return {
            'success': True,
            'email_log_id': email_log.id,
            'message': f'El. laiškas išsiųstas į {recipient_email}'
        }
    except Exception as e:
        logger.error(f"Klaida siunčiant el. laišką: {str(e)}", exc_info=True)
        email_log.status = EmailLog.Status.FAILED
        email_log.error_message = str(e)
        email_log.save(update_fields=['status', 'error_message'])
        
        return {
            'success': False,
            'email_log_id': email_log.id,
            'error': f'Klaida siunčiant el. laišką: {str(e)}'
        }


def send_email_message_with_logging(
    email_message: EmailMessage,
    email_type: str,
    related_order_id: int = None,
    related_invoice_id: int = None,
    related_expedition_id: int = None,
    related_partner_id: int = None,
    sent_by=None,
    metadata: dict = None
):
    """
    Siunčia EmailMessage objektą (su priedais) ir išsaugo į istoriją
    
    Args:
        email_message: EmailMessage objektas su priedais
        email_type: Email tipas (reminder, order, invoice, expedition, custom)
        related_order_id: Susietas užsakymo ID (optional)
        related_invoice_id: Susieta sąskaitos ID (optional)
        related_expedition_id: Susieta ekspedicijos ID (optional)
        related_partner_id: Susietas partnerio ID (optional)
        sent_by: User objektas, kuris siuntė (optional)
        metadata: Papildomi duomenys (optional)
    
    Returns:
        dict su 'success', 'email_log_id', 'message' arba 'error'
    """
    # Išgauti duomenis iš EmailMessage
    original_recipient = email_message.to[0] if email_message.to else ''
    recipient_name = ''
    
    # Bandyti išgauti recipient_name iš metadata arba email_message
    if metadata and 'recipient_name' in metadata:
        recipient_name = metadata.get('recipient_name', '')
    
    # Patikrinti testavimo režimą
    test_recipient = get_test_mode_recipient()
    if test_recipient:
        # Testavimo režime: nukreipti visus el. laiškus į testavimo adresą
        # Išsaugoti originalius gavėjus
        original_recipients = email_message.to.copy() if email_message.to else []
        original_recipient_str = ', '.join(original_recipients) if original_recipients else 'nežinomas'
        
        # Nukreipti į testavimo adresą
        email_message.to = [test_recipient]
        # Jei yra cc arba bcc, juos taip pat nukreipti į testavimo adresą
        if hasattr(email_message, 'cc') and email_message.cc:
            original_recipient_str += f" (CC: {', '.join(email_message.cc)})"
            email_message.cc = [test_recipient]
        if hasattr(email_message, 'bcc') and email_message.bcc:
            original_recipient_str += f" (BCC: {', '.join(email_message.bcc)})"
            email_message.bcc = [test_recipient]
        
        # Pridėti info į temą
        email_message.subject = f"[TEST] {email_message.subject} (Originalus gavėjas: {original_recipient_str})"
        # Pridėti info į laiško turinį
        if email_message.body:
            email_message.body = f"[TESTAVIMO REŽIMAS]\nOriginalus gavėjas: {original_recipient_str}\n\n{email_message.body}"
        
        # Atnaujinti original_recipient kintamąjį, jei jis buvo tuščias
        if not original_recipient and original_recipients:
            original_recipient = original_recipients[0]
    
    # Sukurti log įrašą (su originaliu gavėju)
    email_log = None
    try:
        email_log = EmailLog.objects.create(
            email_type=email_type,
            subject=email_message.subject,
            recipient_email=original_recipient,  # Log'e visada originalus adresas
            recipient_name=recipient_name,
            body_text=email_message.body or '',
            body_html='',  # EmailMessage gali turėti HTML, bet čia nėra tiesioginio prieigos
            related_order_id=related_order_id,
            related_invoice_id=related_invoice_id,
            related_expedition_id=related_expedition_id,
            related_partner_id=related_partner_id,
            sent_by=sent_by,
            metadata=metadata or {},
            status=EmailLog.Status.PENDING
        )
    except Exception as log_error:
        # Jei nepavyko sukurti log įrašo (pvz., lentelė neegzistuoja), vis tiek bandyti siųsti el. laišką
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Nepavyko sukurti EmailLog įrašo: {log_error}. Siunčiamas el. laiškas be logavimo.")
    
    try:
        # Siųsti el. laišką (į testavimo adresą, jei režimas įjungtas)
        result = email_message.send(fail_silently=False)
        
        # Atnaujinti statusą, jei log įrašas egzistuoja
        if email_log:
            email_log.status = EmailLog.Status.SENT
            email_log.sent_at = timezone.now()
            email_log.save(update_fields=['status', 'sent_at'])
        
        # Gauti gavėjo adresą (gali būti testavimo adresas, jei režimas įjungtas)
        final_recipient = email_message.to[0] if email_message.to else original_recipient or 'nežinomas'
        
        # Registruoti veiksmą ActivityLog
        if email_log:
            try:
                from apps.core.services.activity_log_service import ActivityLogService
                from apps.core.models import ActivityLog
                
                # Gauti susijusį objektą
                content_object = None
                if related_order_id:
                    from apps.orders.models import Order
                    try:
                        content_object = Order.objects.get(id=related_order_id)
                    except Order.DoesNotExist:
                        pass
                elif related_invoice_id:
                    from apps.invoices.models import SalesInvoice, PurchaseInvoice
                    try:
                        content_object = SalesInvoice.objects.filter(id=related_invoice_id).first()
                        if not content_object:
                            content_object = PurchaseInvoice.objects.filter(id=related_invoice_id).first()
                    except:
                        pass
                elif related_partner_id:
                    from apps.partners.models import Partner
                    try:
                        content_object = Partner.objects.get(id=related_partner_id)
                    except Partner.DoesNotExist:
                        pass
                
                ActivityLogService.log_action(
                    action_type=ActivityLog.ActionType.EMAIL_SENT,
                    description=f'El. laiškas "{email_message.subject}" išsiųstas į {final_recipient}',
                    user=sent_by,
                    content_object=content_object,
                    metadata={
                        'email_type': email_type,
                        'subject': email_message.subject,
                        'recipient_email': final_recipient,
                        'recipient_name': recipient_name,
                        'related_order_id': related_order_id,
                        'related_invoice_id': related_invoice_id,
                        'related_partner_id': related_partner_id,
                        'email_log_id': email_log.id,
                    },
                    request=None  # Email siuntimas gali vykti background task'uose, todėl request gali būti None
                )
            except Exception as e:
                logger.warning(f"Failed to log email sending to ActivityLog: {e}")
        
        return {
            'success': True,
            'email_log_id': email_log.id if email_log else None,
            'message': f'El. laiškas išsiųstas į {final_recipient}'
        }
    except Exception as e:
        # Išsaugoti klaidą, jei log įrašas egzistuoja
        if email_log:
            try:
                email_log.status = EmailLog.Status.FAILED
                email_log.error_message = str(e)
                email_log.save(update_fields=['status', 'error_message'])
            except:
                pass  # Jei nepavyko atnaujinti, ignoruoti
        
        # Pakelti exception, kad views kodas galėtų ją apdoroti
        # Taip el. laiškų siuntimas veiks kaip prieš tai
        raise

