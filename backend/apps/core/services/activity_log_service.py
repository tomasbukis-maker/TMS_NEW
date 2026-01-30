"""
ActivityLogService - Centralizuotas veiksmų istorijos servisas

Šis servisas yra vienintelis būdas registruoti veiksmus sistemoje.
Visi svarbūs veiksmai turi eiti per šį servisą.
"""
import logging
from typing import Optional, Dict, Any
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from ..models import ActivityLog

logger = logging.getLogger(__name__)
User = get_user_model()


class ActivityLogService:
    """Centralizuotas veiksmų istorijos servisas"""
    
    @staticmethod
    def log_action(
        action_type: str,
        description: str,
        user: Optional[User] = None,
        content_object: Optional[Any] = None,
        metadata: Optional[Dict[str, Any]] = None,
        request=None
    ) -> ActivityLog:
        """
        Registruoti veiksmą sistemoje.
        
        Args:
            action_type: Veiksmo tipas (ActivityLog.ActionType)
            description: Detalus veiksmo aprašymas
            user: Vartotojas, kuris atliko veiksmą
            content_object: Susijęs objektas (pvz., Order, Invoice)
            metadata: Papildoma informacija JSON formatu
            request: Django request objektas (naudojamas gauti IP ir User Agent)
        
        Returns:
            ActivityLog objektas
        """
        # Gauti content_type ir object_id, jei content_object pateiktas
        content_type = None
        object_id = None
        if content_object:
            content_type = ContentType.objects.get_for_model(content_object)
            object_id = content_object.pk
        
        # Gauti vartotojo vardą
        user_name = ''
        if user:
            user_name = user.get_full_name() or user.username
        elif request and hasattr(request, 'user') and request.user.is_authenticated:
            user = request.user
            user_name = user.get_full_name() or user.username
        
        # Gauti IP adresą ir User Agent iš request
        ip_address = None
        user_agent = ''
        if request:
            # IP adresas
            x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
            if x_forwarded_for:
                ip_address = x_forwarded_for.split(',')[0].strip()
            else:
                ip_address = request.META.get('REMOTE_ADDR')
            
            # User Agent
            user_agent = request.META.get('HTTP_USER_AGENT', '')
        
        # Užtikrinti, kad metadata yra JSON serializuojama
        import json
        try:
            # Išbandyti JSON serializaciją
            json.dumps(metadata or {})
        except (TypeError, ValueError) as e:
            # Jei nepavyksta, konvertuoti viską į string'us
            def force_stringify(obj):
                if isinstance(obj, dict):
                    return {k: force_stringify(v) for k, v in obj.items()}
                elif isinstance(obj, (list, tuple)):
                    return [force_stringify(item) for item in obj]
                else:
                    return str(obj)

            metadata = force_stringify(metadata or {})

        # Sukurti ActivityLog įrašą
        activity_log = ActivityLog.objects.create(
            action_type=action_type,
            description=description,
            content_type=content_type,
            object_id=object_id,
            metadata=metadata,
            user=user,
            user_name=user_name,
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        logger.info(f'Activity logged: {action_type} - {description[:100]}')
        
        return activity_log
    
    @staticmethod
    def log_order_created(order, user=None, request=None):
        """Registruoti užsakymo sukūrimą"""
        return ActivityLogService.log_action(
            action_type=ActivityLog.ActionType.ORDER_CREATED,
            description=f'Užsakymas #{order.order_number or order.id} sukurtas',
            user=user,
            content_object=order,
            metadata={
                'order_number': order.order_number,
                'client_name': order.client.name if order.client else None,
            },
            request=request
        )
    
    @staticmethod
    def log_order_updated(order, user=None, request=None, changes=None):
        """Registruoti užsakymo atnaujinimą"""
        # Konvertuoti Decimal objektus į string'us JSON serializacijai
        def convert_for_json(obj):
            if isinstance(obj, dict):
                return {k: convert_for_json(v) for k, v in obj.items()}
            elif hasattr(obj, '__str__'):  # Apima Decimal ir kitus objektus
                return str(obj)
            else:
                return obj

        safe_changes = convert_for_json(changes or {})

        return ActivityLogService.log_action(
            action_type=ActivityLog.ActionType.ORDER_UPDATED,
            description=f'Užsakymas #{order.order_number or order.id} atnaujintas',
            user=user,
            content_object=order,
            metadata={
                'order_number': order.order_number,
                'changes': safe_changes,
            },
            request=request
        )

    @staticmethod
    def log_order_field_updated(order, field_name, old_value, new_value, user=None, request=None):
        """Registruoti konkretaus užsakymo lauko pakeitimą"""
        # Konvertuoti reikšmes į žmogui suprantamą formatą
        def format_value(value, field_name=None):
            if value is None:
                return 'tuščia'
            if isinstance(value, bool):
                return 'taip' if value else 'ne'
            if field_name and 'date' in field_name.lower() and hasattr(value, 'strftime'):
                return value.strftime('%Y-%m-%d %H:%M')
            if hasattr(value, '__str__'):
                return str(value)
            return str(value)

        old_display = format_value(old_value, field_name)
        new_display = format_value(new_value, field_name)

        # Laukų pavadinimų vertimai
        field_labels = {
            'client_price_net': 'kliento kaina (be PVM)',
            'my_price_net': 'mano kaina (be PVM)',
            'route_from': 'maršrutas iš',
            'route_to': 'maršrutas į',
            'loading_date': 'pakrovimo data',
            'unloading_date': 'iškrovimo data',
            'description': 'aprašymas',
            'notes': 'pastabos',
            'vehicle_type': 'mašinos tipas',
            'status': 'statusas',
        }

        field_display = field_labels.get(field_name, field_name)

        # Konvertuoti reikšmes į JSON saugius tipus
        def convert_for_json(obj):
            if isinstance(obj, dict):
                return {k: convert_for_json(v) for k, v in obj.items()}
            elif hasattr(obj, '__str__'):  # Apima Decimal, datetime ir kitus objektus
                return str(obj)
            else:
                return obj

        return ActivityLogService.log_action(
            action_type=ActivityLog.ActionType.ORDER_FIELD_UPDATED,
            description=f'Užsakymas #{order.order_number or order.id}: {field_display} pakeista iš "{old_display}" į "{new_display}"',
            user=user,
            content_object=order,
            metadata={
                'order_number': order.order_number,
                'field_name': field_name,
                'field_display': field_display,
                'old_value': convert_for_json(old_value),
                'new_value': convert_for_json(new_value),
                'old_display': old_display,
                'new_display': new_display,
            },
            request=request
        )

    @staticmethod
    def log_order_deleted(order, user=None, request=None):
        """Registruoti užsakymo ištrynimą"""
        return ActivityLogService.log_action(
            action_type=ActivityLog.ActionType.ORDER_DELETED,
            description=f'Užsakymas #{order.order_number or order.id} ištrintas',
            user=user,
            metadata={
                'order_number': order.order_number,
                'client_name': order.client.name if order.client else None,
            },
            request=request
        )
    
    @staticmethod
    def log_sales_invoice_created(invoice, user=None, request=None):
        """Registruoti pardavimo sąskaitos sukūrimą"""
        return ActivityLogService.log_action(
            action_type=ActivityLog.ActionType.SALES_INVOICE_CREATED,
            description=f'Pardavimo sąskaita #{invoice.invoice_number} sukurta',
            user=user,
            content_object=invoice,
            metadata={
                'invoice_number': invoice.invoice_number,
                'partner_name': invoice.partner.name if invoice.partner else None,
                'amount_total': str(invoice.amount_total),
            },
            request=request
        )
    
    @staticmethod
    def log_sales_invoice_updated(invoice, user=None, request=None, changes=None):
        """Registruoti pardavimo sąskaitos atnaujinimą"""
        return ActivityLogService.log_action(
            action_type=ActivityLog.ActionType.SALES_INVOICE_UPDATED,
            description=f'Pardavimo sąskaita #{invoice.invoice_number} atnaujinta',
            user=user,
            content_object=invoice,
            metadata={
                'invoice_number': invoice.invoice_number,
                'changes': changes or {},
            },
            request=request
        )
    
    @staticmethod
    def log_sales_invoice_deleted(invoice, user=None, request=None):
        """Registruoti pardavimo sąskaitos ištrynimą"""
        return ActivityLogService.log_action(
            action_type=ActivityLog.ActionType.SALES_INVOICE_DELETED,
            description=f'Pardavimo sąskaita #{invoice.invoice_number} ištrinta',
            user=user,
            metadata={
                'invoice_number': invoice.invoice_number,
                'partner_name': invoice.partner.name if invoice.partner else None,
            },
            request=request
        )
    
    @staticmethod
    def log_purchase_invoice_created(invoice, user=None, request=None):
        """Registruoti pirkimo sąskaitos sukūrimą"""
        return ActivityLogService.log_action(
            action_type=ActivityLog.ActionType.PURCHASE_INVOICE_CREATED,
            description=f'Pirkimo sąskaita #{invoice.received_invoice_number} sukurta',
            user=user,
            content_object=invoice,
            metadata={
                'invoice_number': invoice.received_invoice_number,
                'partner_name': invoice.partner.name if invoice.partner else None,
                'amount_total': str(invoice.amount_total),
            },
            request=request
        )
    
    @staticmethod
    def log_purchase_invoice_updated(invoice, user=None, request=None, changes=None):
        """Registruoti pirkimo sąskaitos atnaujinimą"""
        return ActivityLogService.log_action(
            action_type=ActivityLog.ActionType.PURCHASE_INVOICE_UPDATED,
            description=f'Pirkimo sąskaita #{invoice.received_invoice_number} atnaujinta',
            user=user,
            content_object=invoice,
            metadata={
                'invoice_number': invoice.received_invoice_number,
                'changes': changes or {},
            },
            request=request
        )
    
    @staticmethod
    def log_purchase_invoice_deleted(invoice, user=None, request=None):
        """Registruoti pirkimo sąskaitos ištrynimą"""
        return ActivityLogService.log_action(
            action_type=ActivityLog.ActionType.PURCHASE_INVOICE_DELETED,
            description=f'Pirkimo sąskaita #{invoice.received_invoice_number} ištrinta',
            user=user,
            metadata={
                'invoice_number': invoice.received_invoice_number,
                'partner_name': invoice.partner.name if invoice.partner else None,
            },
            request=request
        )
    
    @staticmethod
    def log_payment_added(payment, invoice_type, user=None, request=None):
        """Registruoti mokėjimo pridėjimą"""
        # InvoicePayment turi sales_invoice arba purchase_invoice, ne invoice
        invoice = payment.sales_invoice if hasattr(payment, 'sales_invoice') and payment.sales_invoice else payment.purchase_invoice if hasattr(payment, 'purchase_invoice') and payment.purchase_invoice else None
        if not invoice:
            # Jei negalime gauti sąskaitos, bandyti gauti per invoice_type
            if invoice_type == 'sales' and hasattr(payment, 'sales_invoice_id') and payment.sales_invoice_id:
                from apps.invoices.models import SalesInvoice
                try:
                    invoice = SalesInvoice.objects.get(id=payment.sales_invoice_id)
                except:
                    pass
            elif invoice_type == 'purchase' and hasattr(payment, 'purchase_invoice_id') and payment.purchase_invoice_id:
                from apps.invoices.models import PurchaseInvoice
                try:
                    invoice = PurchaseInvoice.objects.get(id=payment.purchase_invoice_id)
                except:
                    pass
        
        invoice_number = None
        invoice_id = None
        if invoice:
            invoice_number = getattr(invoice, 'invoice_number', None) or getattr(invoice, 'received_invoice_number', None)
            invoice_id = invoice.id
        
        return ActivityLogService.log_action(
            action_type=ActivityLog.ActionType.PAYMENT_ADDED,
            description=f'Mokėjimas {payment.amount} € pridėtas prie {"pardavimo" if invoice_type == "sales" else "pirkimo"} sąskaitos #{invoice_number or "N/A"}',
            user=user,
            content_object=payment,
            metadata={
                'payment_id': payment.id,
                'amount': str(payment.amount),
                'payment_date': payment.payment_date.isoformat() if payment.payment_date else None,
                'invoice_type': invoice_type,
                'invoice_id': invoice_id,
            },
            request=request
        )
    
    @staticmethod
    def log_payment_deleted(payment, invoice_type, user=None, request=None):
        """Registruoti mokėjimo ištrynimą"""
        # InvoicePayment turi sales_invoice arba purchase_invoice, ne invoice
        # Jei payment yra dict (iš payment_data), bandyti gauti invoice per metadata arba per invoice_type
        invoice = None
        invoice_number = None
        invoice_id = None
        
        if hasattr(payment, 'invoice'):
            # Jei yra invoice atributas (TempPayment klasė)
            invoice = payment.invoice
        elif hasattr(payment, 'sales_invoice') and payment.sales_invoice:
            invoice = payment.sales_invoice
        elif hasattr(payment, 'purchase_invoice') and payment.purchase_invoice:
            invoice = payment.purchase_invoice
        elif isinstance(payment, dict):
            # Jei payment yra dict (payment_data), bandyti gauti invoice per invoice_id iš metadata
            # Bet čia neturime invoice objekto, todėl naudosime tik ID
            pass
        
        if invoice:
            invoice_number = getattr(invoice, 'invoice_number', None) or getattr(invoice, 'received_invoice_number', None)
            invoice_id = invoice.id
        elif hasattr(payment, 'invoice_id'):
            invoice_id = payment.invoice_id
        
        # Jei turime payment_data dict, gauti invoice_id iš metadata
        if not invoice_id and isinstance(payment, dict) and 'invoice_id' in payment:
            invoice_id = payment.get('invoice_id')
        
        return ActivityLogService.log_action(
            action_type=ActivityLog.ActionType.PAYMENT_DELETED,
            description=f'Mokėjimas {payment.amount if hasattr(payment, "amount") else payment.get("amount", "N/A")} € ištrintas iš {"pardavimo" if invoice_type == "sales" else "pirkimo"} sąskaitos #{invoice_number or "N/A"}',
            user=user,
            metadata={
                'payment_id': payment.id if hasattr(payment, 'id') else payment.get('id'),
                'amount': str(payment.amount) if hasattr(payment, 'amount') else str(payment.get('amount', '')),
                'invoice_type': invoice_type,
                'invoice_id': invoice_id,
            },
            request=request
        )
    
    @staticmethod
    def log_custom_action(
        description: str,
        user=None,
        content_object=None,
        metadata=None,
        request=None
    ):
        """Registruoti bet kokį kitą veiksmą"""
        return ActivityLogService.log_action(
            action_type=ActivityLog.ActionType.CUSTOM,
            description=description,
            user=user,
            content_object=content_object,
            metadata=metadata,
            request=request
        )
