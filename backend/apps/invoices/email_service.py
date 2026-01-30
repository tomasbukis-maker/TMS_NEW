"""
Email siuntimo paslauga debitorių priminimams
"""
from django.utils import timezone
from datetime import timedelta
from django.core.mail import EmailMessage, get_connection
from apps.mail.email_logger import send_email_message_with_logging
from apps.settings.email_utils import render_email_template
from .models import SalesInvoice, PurchaseInvoice, InvoiceReminder


def _determine_reminder_type(invoice: SalesInvoice, notification_settings):
    """
    Nustato priminimo tipą pagal sąskaitos statusą ir datą.
    
    Returns:
        'due_soon' - artėja terminas (dar nepasiekė, bet arti)
        'unpaid' - neapmokėta sąskaita (termines pasiekė, bet dar neapmokėta)
        'overdue' - vėluojama apmokėti (termines praėjo)
        None - sąskaita jau apmokėta arba negalima nustatyti tipo
    """
    today = timezone.now().date()
    
    # Jei sąskaita jau apmokėta, negalime nustatyti tipo
    if invoice.payment_status == 'paid':
        return None
    
    # Jei nėra due_date, nustatyti pagal statusą
    if not invoice.due_date:
        if invoice.payment_status == 'overdue':
            return 'overdue'
        elif invoice.payment_status == 'partially_paid':
            return 'overdue'
        else:
            return 'unpaid'
    
    # Skaičiuoti dienas iki termino arba po termino
            days_until_due = (invoice.due_date - today).days
            days_before = notification_settings.email_notify_due_soon_days_before or 3
            
    # Vėluojama apmokėti - terminas jau praėjo
    if days_until_due < 0:
        return 'overdue'
    
    # Artėja terminas - dar nepasiekė, bet arti (tik jei unpaid)
    if 0 < days_until_due <= days_before and invoice.payment_status == 'unpaid':
        return 'due_soon'
    
    # Neapmokėta sąskaita - terminas šiandien arba jau praėjo, bet statusas unpaid
    if invoice.payment_status == 'unpaid':
        return 'unpaid'
    
    # Vėluojama apmokėti - statusas overdue arba partially_paid
    if invoice.payment_status in ['overdue', 'partially_paid']:
        return 'overdue'
    
    # Default - unpaid
    return 'unpaid'


def _should_send_reminder(
    invoice: SalesInvoice,
    reminder_type: str,
    notification_settings,
    is_manual: bool = False
):
    """
    Patikrina, ar reikia siųsti priminimą.
    
    Returns:
        (should_send: bool, error_message: str)
    """
    partner = invoice.partner
    
    # Rankinis siuntimas - visada siųsti
    if is_manual:
        return True, None
    
    # Automatinis siuntimas - tikrinti nustatymus
    
    # Patikrinti globalius nustatymus
    if reminder_type == 'due_soon':
        if not notification_settings.email_notify_due_soon_enabled:
            return False, 'Automatinis priminimų siuntimas apie artėjantį terminą išjungtas'
        if not partner.email_notify_due_soon:
            return False, 'Partneris neturi įjungto priminimų siuntimo apie artėjantį terminą'
    
    elif reminder_type == 'unpaid':
        if not notification_settings.email_notify_unpaid_enabled:
            return False, 'Automatinis priminimų siuntimas apie neapmokėtas sąskaitas išjungtas'
        if not partner.email_notify_unpaid:
            return False, 'Partneris neturi įjungto priminimų siuntimo apie neapmokėtas sąskaitas'
    
    elif reminder_type == 'overdue':
        if not notification_settings.email_notify_overdue_enabled:
            return False, 'Automatinis priminimų siuntimas apie vėluojančias sąskaitas išjungtas'
        if not partner.email_notify_overdue:
            return False, 'Partneris neturi įjungto priminimų siuntimo apie vėluojančias sąskaitas'
    
    # Patikrinti minimalią sumą
    min_amount = None
    if reminder_type == 'due_soon':
        min_amount = notification_settings.email_notify_due_soon_min_amount or 0
    elif reminder_type == 'unpaid':
        min_amount = notification_settings.email_notify_unpaid_min_amount or 0
    elif reminder_type == 'overdue':
        min_amount = notification_settings.email_notify_overdue_min_amount or 0
    
    if min_amount and min_amount > 0 and invoice.amount_total < min_amount:
        return False, f'Sąskaitos suma ({invoice.amount_total} EUR) mažesnė už minimalią sumą ({min_amount} EUR)'
    
    # Patikrinti, ar reikia siųsti pagal intervalą (tik automatiniam siuntimui)
    reminder, created = InvoiceReminder.objects.get_or_create(
        invoice=invoice,
        reminder_type=reminder_type,
        defaults={'sent_count': 0}
    )
    
    if not created and reminder.last_sent_at:
        # Skaičiuoti dienas nuo paskutinio siuntimo
        days_since_last = (timezone.now() - reminder.last_sent_at).days
        
        # Gauti intervalą
        interval_days = None
        if reminder_type == 'unpaid':
            interval_days = notification_settings.email_notify_unpaid_interval_days or 7
        elif reminder_type == 'overdue':
            interval_days = notification_settings.email_notify_overdue_interval_days or 7
        # due_soon - siųsti tik vieną kartą (jei jau siųsta, nebe siųsti)
        elif reminder_type == 'due_soon':
            return False, 'Priminimas apie artėjantį terminą jau buvo išsiųstas'
        
        if interval_days and days_since_last < interval_days:
            return False, f'Paskutinis priminimas buvo išsiųstas {days_since_last} dienų prieš. Minimalus intervalas: {interval_days} dienos'
    
    # Patikrinti vėluojančių priminimų intervalą
    if reminder_type == 'overdue':
        overdue_min_days = notification_settings.email_notify_overdue_min_days or 0
        overdue_max_days = notification_settings.email_notify_overdue_max_days or 365
        
        if invoice.overdue_days < overdue_min_days:
            return False, f'Sąskaitos vėlavimas ({invoice.overdue_days} dienos) mažesnis už minimalų ({overdue_min_days} dienos)'
        
        if overdue_max_days > 0 and invoice.overdue_days > overdue_max_days:
            return False, f'Sąskaitos vėlavimas ({invoice.overdue_days} dienos) didesnis už maksimalų ({overdue_max_days} dienos)'
    
    return True, None


def _get_recipient_email_and_name(invoice: SalesInvoice, notification_settings, is_manual: bool = False):
    """
    Gauna gavėjo el. pašto adresą ir vardą.
    
    Returns:
        (email: str | None, name: str)
    """
    partner = invoice.partner
    recipient_name = partner.name or 'Klientas'
    recipient_email = None
    
    # Patikrinti, ar partneris turi kontaktą su email
    if partner.contact_person and partner.contact_person.email:
        contact_email = str(partner.contact_person.email).strip()
        if contact_email and '@' in contact_email:
            recipient_email = contact_email
            recipient_name = partner.contact_person.first_name or partner.name or 'Klientas'
    
    # Jei nėra partnerio email, patikrinti testavimo režimą arba rankinį siuntimą
    if not recipient_email:
        test_mode = notification_settings.email_test_mode
        test_email_raw = notification_settings.email_test_recipient
        test_email = None
        
        if test_email_raw:
            test_email_str = str(test_email_raw).strip()
            if test_email_str and '@' in test_email_str:
                test_email = test_email_str
        
        # Rankinis siuntimas arba testavimo režimas
        if is_manual or test_mode:
            if test_email:
                recipient_email = test_email
            elif test_mode:
                recipient_email = 'info@hotmail.lt'
            elif is_manual:
                return None, recipient_name
        else:
            return None, recipient_name
    
    if recipient_email is None:
        return None, recipient_name
    
    recipient_email = str(recipient_email).strip()
    
    if not recipient_email or '@' not in recipient_email:
        return None, recipient_name
    
    return recipient_email, recipient_name


def send_debtor_reminder_email(
    invoice: SalesInvoice,
    template_data: dict = None,
    sent_by=None,
    reminder_type: str = None
):
    """
    Siunčia priminimo email klientui.
    
    Args:
        invoice: SalesInvoice objektas
        template_data: Papildomi duomenys šablonui
        sent_by: User objektas, kuris siuntė (optional)
        reminder_type: Priminimo tipas ('due_soon', 'unpaid', 'overdue'). 
                       Jei None, nustatoma automatiškai pagal sąskaitos statusą ir datą.
    
    Returns:
        dict su 'success' (bool), 'error' arba 'message' (str), 'email_log_id' (int)
    """
    from apps.settings.models import NotificationSettings
    
    notification_settings = NotificationSettings.load()
    is_manual = (sent_by is not None)
    
    # Nustatyti reminder_type, jei nenurodytas
    if reminder_type is None:
        reminder_type = _determine_reminder_type(invoice, notification_settings)
        if not reminder_type:
            return {
                'success': False,
                'error': 'Sąskaita jau apmokėta'
            }
    
    # Patikrinti, ar reikia siųsti priminimą
    should_send, error_message = _should_send_reminder(
        invoice,
        reminder_type,
        notification_settings,
        is_manual=is_manual
    )
    
    if not should_send:
        return {
            'success': False,
            'error': error_message
        }
    
    # Gauti gavėjo el. pašto adresą ir vardą
    recipient_email, recipient_name = _get_recipient_email_and_name(
        invoice,
        notification_settings,
        is_manual=is_manual
    )
    
    # Patikrinti, ar el. pašto adresas yra validus
    if not recipient_email or not isinstance(recipient_email, str):
        if is_manual:
            return {
                'success': False,
                'error': f'Partneris "{invoice.partner.name}" neturi el. pašto adreso ir testavimo adresas nėra nustatytas. Nustatykite testavimo adresą nustatymuose arba pridėkite el. pašto adresą partnerio kontaktiniam asmeniui.'
            }
        else:
            return {
                'success': False,
                'error': f'Partneris "{invoice.partner.name}" neturi el. pašto adreso'
        }
    
    recipient_email = recipient_email.strip()
    
    if not recipient_email or '@' not in recipient_email:
        if is_manual:
            return {
                'success': False,
                'error': 'El. pašto adresas negali būti tuščias arba neteisingas. Patikrinkite partnerio kontaktą arba nustatykite testavimo adresą nustatymuose.'
            }
        else:
            return {
                'success': False,
                'error': f'El. pašto adresas yra neteisingas: "{recipient_email}". Partneris: {invoice.partner.name}'
            }
    
    # Nustatyti template tipą pagal reminder_type
    template_type_map = {
        'due_soon': 'reminder_due_soon',
        'unpaid': 'reminder_unpaid',
        'overdue': 'reminder_overdue'
    }
    template_type = template_type_map.get(reminder_type, 'reminder_unpaid')
    
    # Skaičiuoti vėlavimo dienas dinamiškai pagal due_date ir šiandienos datą
    today = timezone.now().date()
    overdue_days = 0
    if invoice.due_date:
        days_overdue = (today - invoice.due_date).days
        overdue_days = max(0, days_overdue) if days_overdue > 0 else 0
    
    # Rasti kitas to paties partnerio neapmokėtas sąskaitas (išskyrus dabartinę)
    other_unpaid_invoices = []
    if invoice.partner:
        other_invoices = SalesInvoice.objects.filter(
            partner=invoice.partner,
            payment_status__in=['unpaid', 'overdue', 'partially_paid']
        ).exclude(id=invoice.id).order_by('due_date', 'invoice_number')
        
        for other_invoice in other_invoices:
            if not other_invoice.due_date:
                continue
            
            days_until_due = (other_invoice.due_date - today).days
            
            # Nustatyti statusą
            if days_until_due < 0:
                # Vėluojama
                days_overdue_other = abs(days_until_due)
                status_text = f"Vėluoja {days_overdue_other} d."
            elif days_until_due == 0:
                # Terminas šiandien
                status_text = "Terminas apmokėti suėjo šiandien!"
            else:
                # Dar nepasiekė termino
                status_text = f"Liko {days_until_due} d."
            
            other_unpaid_invoices.append({
                'invoice_number': other_invoice.invoice_number,
                'status': status_text,
                'amount': str(other_invoice.amount_total or other_invoice.amount_net or '0.00'),
                'due_date': other_invoice.due_date.strftime('%Y-%m-%d') if other_invoice.due_date else '',
            })
    
    # Formatuoti kitų sąskaitų sąrašą kaip tekstą
    other_invoices_text = ''
    if other_unpaid_invoices:
        lines = []
        for inv in other_unpaid_invoices:
            lines.append(f"{inv['invoice_number']} - {inv['status']}")
        other_invoices_text = '\n'.join(lines)
    
    # Paruošti kintamuosius template'ui
    context = {
        'invoice_number': invoice.invoice_number or f'Sąskaita #{invoice.id}',
        'partner_name': recipient_name,
        'amount': str(invoice.amount_total or invoice.amount_net or '0.00'),
        'amount_net': str(invoice.amount_net or '0.00') if invoice.amount_net else '0.00',
        'amount_total': str(invoice.amount_total or '0.00') if invoice.amount_total else '0.00',
        'vat_rate': str(invoice.vat_rate) if invoice.vat_rate else '0',
        'issue_date': invoice.issue_date.strftime('%Y-%m-%d') if invoice.issue_date else '',
        'due_date': invoice.due_date.strftime('%Y-%m-%d') if invoice.due_date else '',
        'overdue_days': str(overdue_days),
        'payment_status': invoice.get_payment_status_display() if hasattr(invoice, 'get_payment_status_display') else str(invoice.payment_status),
        'other_unpaid_invoices': other_invoices_text,
    }
    
    # Pridėti užsakymo informaciją, jei yra
    if invoice.related_order:
        context['order_number'] = invoice.related_order.order_number or f'Užsakymas #{invoice.related_order.id}'
        if invoice.related_order.manager:
            context['manager_name'] = invoice.related_order.manager.get_full_name() or invoice.related_order.manager.username
        else:
            context['manager_name'] = ''
    else:
        context['order_number'] = ''
        context['manager_name'] = ''
    
    # Pridėti papildomus duomenis iš template_data, jei yra
    if template_data:
        context.update(template_data)
    
    # Renderinti email template'ą
    is_auto_generated = not is_manual
    email_content = render_email_template(
        template_type=template_type,
        context=context,
        is_auto_generated=is_auto_generated
    )
    
    
    # Patikrinti SMTP nustatymus
    config = notification_settings
    
    if not config.smtp_enabled:
        return {
            'success': False,
            'error': 'SMTP siuntimas nėra įjungtas. Įjunkite „Įjungti el. laiškų siuntimą" ir išsaugokite nustatymus.'
        }
    
    missing_fields = []
    if not config.smtp_host:
        missing_fields.append('SMTP serveris')
    if not config.smtp_port:
        missing_fields.append('SMTP portas')
    if not config.smtp_username:
        missing_fields.append('SMTP naudotojas')
    if not config.smtp_password:
        missing_fields.append('SMTP slaptažodis')
    if not config.smtp_from_email:
        missing_fields.append('Numatytasis siuntėjas (el. paštas)')
    
    if missing_fields:
        return {
            'success': False,
            'error': 'Nepakanka SMTP nustatymų. Trūksta laukų: ' + ', '.join(missing_fields)
        }
    
    from_email = f"{config.smtp_from_name or 'TMS Sistema'} <{config.smtp_from_email}>"
    
    use_tls = bool(config.smtp_use_tls)
    use_ssl = False
    if not use_tls and config.smtp_port in (465, 587):
        use_ssl = config.smtp_port == 465
    
    try:
        connection = get_connection(
            backend='django.core.mail.backends.smtp.EmailBackend',
            host=config.smtp_host,
            port=config.smtp_port,
            username=config.smtp_username,
            password=config.smtp_password,
            use_tls=use_tls,
            use_ssl=use_ssl,
            timeout=10,
        )
        
        email_msg = EmailMessage(
            subject=email_content['subject'],
            body=email_content['body_text'],
            from_email=from_email,
            to=[recipient_email],
            connection=connection,
        )
        
        result = send_email_message_with_logging(
            email_message=email_msg,
        email_type='reminder',
        related_invoice_id=invoice.id,
            related_partner_id=invoice.partner.id if invoice.partner else None,
            sent_by=sent_by,
            metadata={'recipient_name': recipient_name}
        )
        
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Klaida siunčiant priminimą: {e}", exc_info=True)
        return {
            'success': False,
            'error': f'Klaida siunčiant el. laišką: {str(e)}'
        }
    
    # Jei sėkmingai išsiųsta, atnaujinti InvoiceReminder
    if result.get('success'):
        reminder, created = InvoiceReminder.objects.get_or_create(
            invoice=invoice,
            reminder_type=reminder_type,
            defaults={
                'last_sent_at': timezone.now(),
                'sent_count': 1
            }
        )
        
        if not created:
            reminder.last_sent_at = timezone.now()
            reminder.sent_count += 1
            reminder.save(update_fields=['last_sent_at', 'sent_count', 'updated_at'])
    
    return result


def send_debtor_reminder_bulk(invoice_ids: list):
    """
    Siunčia priminimus keliems debitoriams vienu metu.
    
    Args:
        invoice_ids: Sąskaitų ID sąrašas
    
    Returns:
        dict su 'total', 'successful', 'failed', 'results'
    """
    results = []
    invoices = SalesInvoice.objects.filter(id__in=invoice_ids).select_related(
        'partner', 'partner__contact_person'
    )
    
    for invoice in invoices:
        result = send_debtor_reminder_email(invoice)
        result['invoice_id'] = invoice.id
        result['invoice_number'] = invoice.invoice_number
        results.append(result)
    
    return {
        'total': len(results),
        'successful': sum(1 for r in results if r['success']),
        'failed': sum(1 for r in results if not r['success']),
        'results': results
    }


def send_manager_notification_about_purchase_invoice(purchase_invoice: PurchaseInvoice, sent_by=None):
    """
    Siunčia pranešimą vadybininkui apie tiekėjo sąskaitą, kurią reikia apmokėti.
    
    Args:
        purchase_invoice: PurchaseInvoice objektas
        sent_by: User objektas, kuris siuntė (optional)
    
    Returns:
        dict su 'success' (bool), 'error' arba 'message' (str), 'email_log_id' (int)
    """
    partner = purchase_invoice.partner
    
    # Patikrinti, ar partneris yra tiekėjas ir ar turi įjungtą pranešimą vadybininkui
    if not partner.is_supplier:
        return {
            'success': False,
            'error': 'Partneris nėra tiekėjas'
        }
    
    if not partner.email_notify_manager_invoices:
        return {
            'success': False,
            'error': 'Pranešimai vadybininkui išjungti šiam tiekėjui'
        }
    
    # Gauti vadybininko el. paštą iš susieto užsakymo
    manager = None
    manager_email = None
    manager_name = None
    
    # Pirmiausia patikrinti related_order
    if purchase_invoice.related_order and purchase_invoice.related_order.manager:
        manager = purchase_invoice.related_order.manager
        manager_email = manager.email
        manager_name = manager.get_full_name() or manager.username
    # Jei nėra related_order, patikrinti related_orders (ManyToMany)
    elif purchase_invoice.related_orders.exists():
        first_order = purchase_invoice.related_orders.first()
        if first_order and first_order.manager:
            manager = first_order.manager
            manager_email = manager.email
            manager_name = manager.get_full_name() or manager.username
    
    # Patikrinti testavimo režimą
    from apps.settings.models import NotificationSettings
    notification_settings = NotificationSettings.load()
    test_mode = notification_settings.email_test_mode
    
    if not manager_email:
        if test_mode:
            # Testavimo režime: naudoti testavimo adresą
            manager_email = notification_settings.email_test_recipient or 'info@hotmail.lt'
            manager_name = 'Testavimo vadybininkas'
        else:
            return {
                'success': False,
                'error': 'Nepavyko nustatyti vadybininko el. pašto adreso'
            }
    
    # Formuojame el. laiško turinį
    invoice_number = purchase_invoice.received_invoice_number or purchase_invoice.invoice_number or f'Sąskaita #{purchase_invoice.id}'
    subject = f"Pranešimas apie tiekėjo sąskaitą {invoice_number}"
    
    message = f"""
Sveiki {manager_name or 'Vadybininke'},

Informuojame, kad gauta tiekėjo sąskaita, kurią reikia apmokėti.

Detalės:
- Tiekėjas: {partner.name}
- Sąskaitos numeris: {invoice_number}
- Suma be PVM: {purchase_invoice.amount_net} EUR
- PVM: {purchase_invoice.vat_rate}%
- Suma su PVM: {purchase_invoice.amount_total} EUR
- Išrašymo data: {purchase_invoice.issue_date}
- Mokėjimo terminas: {purchase_invoice.due_date}
"""
    
    if purchase_invoice.related_order:
        message += f"- Susijęs užsakymas: {purchase_invoice.related_order.order_number or f'Užsakymas #{purchase_invoice.related_order.id}'}\n"
    
    message += f"""
Prašome apmokėti sąskaitą iki {purchase_invoice.due_date}.

Su pagarba,
TMS Sistema
"""
    
    # Naudoti wrapper funkciją su istorijos įrašymu
    # Naudoti metadata lauką, kad išsaugoti purchase_invoice_id
    metadata = {
        'purchase_invoice_id': purchase_invoice.id,
        'purchase_invoice_number': purchase_invoice.received_invoice_number or purchase_invoice.invoice_number or f'Sąskaita #{purchase_invoice.id}'
    }
    
    # Jei yra susijęs užsakymas, pridėti jį į metadata
    if purchase_invoice.related_order:
        metadata['related_order_id'] = purchase_invoice.related_order.id
        metadata['related_order_number'] = purchase_invoice.related_order.order_number or f'Užsakymas #{purchase_invoice.related_order.id}'
    
    return send_email_with_logging(
        email_type='manager_notification',
        subject=subject,
        message=message,
        recipient_email=manager_email,
        recipient_name=manager_name or 'Vadybininkas',
        related_order_id=purchase_invoice.related_order.id if purchase_invoice.related_order else None,
        related_partner_id=partner.id,
        sent_by=sent_by,
        metadata=metadata
    )
