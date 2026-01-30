"""
Email šablonų utility funkcijos
"""
from .models import EmailTemplate, NotificationSettings
from typing import Dict, Optional


def render_email_template(
    template_type: str,
    context: Dict[str, any],
    is_auto_generated: bool = True,
    lang: str = 'lt'
) -> Dict[str, str]:
    """
    Renderina email šabloną su kintamaisiais ir prideda pasirašymą bei pranešimus.
    
    Args:
        template_type: Šablono tipas (pvz. 'order_to_client', 'invoice_to_client')
        context: Kintamųjų žodynas (pvz. {'order_number': '2025-169', 'partner_name': 'Klientas'})
        is_auto_generated: Ar laiškas sugeneruotas automatiškai (pridės pranešimą)
        lang: Kalba ('lt', 'en', 'ru')
    
    Returns:
        Dict su 'subject' ir 'body_text' (ir 'body_html' jei yra)
    """
    # Gauti šabloną
    template = EmailTemplate.get_template(template_type, lang=lang)
    
    # Gauti nustatymus
    notification_settings = NotificationSettings.load()
    
    # Pridėti bendrus kintamuosius
    # Vertimai numatytiesiems tekstams
    auto_notices = {
        'lt': notification_settings.email_auto_generated_notice or 'Šis laiškas sugeneruotas automatiškai.',
        'en': 'This email was generated automatically.',
        'ru': 'Это письмо было сгенерировано автоматически.'
    }
    
    manager_notices = {
        'lt': notification_settings.email_contact_manager_notice or 'Jei turite klausimų, kreipkitės į vadybininką {manager_name}.',
        'en': 'If you have any questions, please contact manager {manager_name}.',
        'ru': 'Если у вас есть вопросы, пожалуйста, свяжитесь с менеджером {manager_name}.'
    }
    
    signatures = {
        'lt': notification_settings.email_signature or 'TMS Sistema',
        'en': 'TMS System',
        'ru': 'Система TMS'
    }
    
    with_respect = {
        'lt': 'Su pagarba,',
        'en': 'With best regards,',
        'ru': 'С уважением,'
    }
    
    lang = lang.lower() if lang else 'lt'
    if lang not in ['lt', 'en', 'ru']:
        lang = 'lt'

    full_context = {
        **context,
        'signature': signatures.get(lang, signatures['lt']),
        'auto_generated_notice': auto_notices.get(lang, auto_notices['lt']),
        'contact_manager_notice': manager_notices.get(lang, manager_notices['lt']),
        'with_respect': with_respect.get(lang, with_respect['lt'])
    }
    
    # Pakeisti kintamuosius subject'e
    subject = template.subject
    for key, value in full_context.items():
        if value is not None:
            subject = subject.replace(f'{{{key}}}', str(value))
    
    # Pakeisti kintamuosius body_text'e
    body_text = template.body_text
    for key, value in full_context.items():
        if value is not None:
            body_text = body_text.replace(f'{{{key}}}', str(value))
    
    # Pridėti pranešimus ir pasirašymą
    footer_parts = []
    
    # Pridėti automatinio generavimo pranešimą
    if is_auto_generated and full_context.get('auto_generated_notice'):
        footer_parts.append(full_context['auto_generated_notice'])
    
    # Pridėti vadybininko pranešimą (jei yra manager info)
    if full_context.get('contact_manager_notice'):
        # Galime pridėti manager info jei yra context'e
        manager_notice = full_context['contact_manager_notice']
        # Jei yra manager_name, galime jį pridėti
        if 'manager_name' in full_context and full_context['manager_name']:
            manager_notice = manager_notice.replace('{manager_name}', full_context['manager_name'])
        footer_parts.append(manager_notice)
    
    # Pridėti pasirašymą
    footer_parts.append(f"\n{full_context['with_respect']}\n{full_context['signature']}")
    
    # Sujungti body_text su footer'iu
    if footer_parts:
        body_text = body_text.rstrip() + '\n\n' + '\n\n'.join(footer_parts)
    
    result = {
        'subject': subject,
        'body_text': body_text,
    }
    
    # Pridėti HTML jei yra
    if template.body_html:
        body_html = template.body_html
        for key, value in full_context.items():
            if value is not None:
                body_html = body_html.replace(f'{{{key}}}', str(value))
        
        # Pridėti footer'į HTML formatu
        html_footer = '<br><br>'
        if is_auto_generated and full_context.get('auto_generated_notice'):
            html_footer += f'<p>{full_context["auto_generated_notice"].replace(chr(10), "<br>")}</p>'
        if full_context.get('contact_manager_notice'):
            manager_notice = full_context['contact_manager_notice']
            if 'manager_name' in full_context and full_context['manager_name']:
                manager_notice = manager_notice.replace('{manager_name}', full_context['manager_name'])
            html_footer += f'<p>{manager_notice.replace(chr(10), "<br>")}</p>'
        html_footer += f'<p>{full_context["with_respect"]}<br>{full_context["signature"]}</p>'
        body_html = body_html.rstrip() + html_footer
        result['body_html'] = body_html
    
    return result

