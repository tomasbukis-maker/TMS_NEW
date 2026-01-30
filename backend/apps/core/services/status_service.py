"""
StatusService - Centralizuotas statusų valdymo servisas

Šis servisas yra vienintelis būdas keisti statusus sistemoje.
Visi statusų pakeitimai turi eiti per šį servisą.
"""
import logging
from typing import Optional, Dict, Any, List, Tuple
from django.contrib.auth import get_user_model
from django.db import transaction

logger = logging.getLogger(__name__)


class StatusService:
    """Centralizuotas statusų valdymo servisas"""
    
    # Cache'as taisyklių (atnaujinamas kai reikia)
    _rules_cache = None
    _cache_timestamp = None
    
    @staticmethod
    def _load_rules_from_db() -> Dict[Tuple[str, str], List[str]]:
        """
        Užkrauti statusų perėjimų taisykles iš duomenų bazės.
        
        Returns:
            Dict su formatu: (entity_type, current_status) -> [allowed_next_statuses]
        """
        from apps.core.models import StatusTransitionRule
        
        rules = {}
        db_rules = StatusTransitionRule.objects.filter(is_active=True).order_by('entity_type', 'order', 'current_status')
        
        for rule in db_rules:
            key = (rule.entity_type, rule.current_status)
            if isinstance(rule.allowed_next_statuses, list):
                rules[key] = rule.allowed_next_statuses
            else:
                rules[key] = []
        
        return rules
    
    @staticmethod
    def _get_rules() -> Dict[Tuple[str, str], List[str]]:
        """
        Gauti statusų perėjimų taisykles (su cache'u).
        
        Returns:
            Dict su formatu: (entity_type, current_status) -> [allowed_next_statuses]
        """
        # Jei cache'as nėra arba pasenęs, užkrauti iš DB
        if StatusService._rules_cache is None:
            StatusService._rules_cache = StatusService._load_rules_from_db()
            from django.utils import timezone
            StatusService._cache_timestamp = timezone.now()
        
        return StatusService._rules_cache
    
    @staticmethod
    def clear_cache():
        """Išvalyti taisyklių cache'ą (naudojama kai taisyklės atnaujinamos)"""
        StatusService._rules_cache = None
        StatusService._cache_timestamp = None
    
    @staticmethod
    def get_allowed_transitions(entity_type: str, current_status: str) -> List[str]:
        """
        Gauti leistinus statusų perėjimus.
        
        Args:
            entity_type: Objekto tipas ('order', 'sales_invoice', 'purchase_invoice', 'order_carrier', 'order_cost')
            current_status: Dabartinis statusas
        
        Returns:
            Sąrašas leistinų naujų statusų
        """
        rules = StatusService._get_rules()
        key = (entity_type, current_status)
        return rules.get(key, [])
    
    @staticmethod
    def is_transition_allowed(entity_type: str, current_status: str, new_status: str) -> bool:
        """
        Patikrinti, ar statusų perėjimas yra leistinas.
        
        Args:
            entity_type: Objekto tipas
            current_status: Dabartinis statusas
            new_status: Naujas statusas
        
        Returns:
            True jei perėjimas leistinas, False jei ne
        """
        allowed = StatusService.get_allowed_transitions(entity_type, current_status)
        return new_status in allowed
    
    @staticmethod
    def change_status(
        entity_type: str,
        entity_id: int,
        new_status: str,
        user=None,
        reason: Optional[str] = None,
        request=None,
        skip_validation: bool = False
    ) -> Dict[str, Any]:
        """
        Pakeisti objekto statusą.
        
        Args:
            entity_type: Objekto tipas ('order', 'sales_invoice', 'purchase_invoice', 'order_carrier', 'order_cost')
            entity_id: Objekto ID
            new_status: Naujas statusas
            user: Vartotojas, kuris keičia statusą
            reason: Pakeitimo priežastis (optional)
            request: Django request objektas (naudojamas ActivityLog)
            skip_validation: Praleisti validaciją (naudojama automatiniams perėjimams)
        
        Returns:
            Dict su 'success', 'old_status', 'new_status', 'entity' ir 'message'
        """
        # Gauti objektą
        entity = StatusService._get_entity(entity_type, entity_id)
        if not entity:
            raise ValueError(f"Objektas nerastas: {entity_type} #{entity_id}")
        
        # Gauti dabartinį statusą
        old_status = StatusService._get_current_status(entity_type, entity)
        
        # Validacija (jei nepraleidžiama)
        if not skip_validation:
            if not StatusService.is_transition_allowed(entity_type, old_status, new_status):
                allowed = StatusService.get_allowed_transitions(entity_type, old_status)
                raise ValueError(
                    f"Neleistinas statusų perėjimas: {old_status} -> {new_status}. "
                    f"Leistini perėjimai: {allowed}"
                )
        
        # Pakeisti statusą
        with transaction.atomic():
            StatusService._set_status(entity_type, entity, new_status)
            entity.save()
            
            # Registruoti veiksmą ActivityLog
            try:
                from apps.core.services.activity_log_service import ActivityLogService
                from apps.core.models import ActivityLog
                
                description = f'{StatusService._get_entity_name(entity_type)} #{entity_id} statusas pakeistas: {old_status} -> {new_status}'
                if reason:
                    description += f'. Priežastis: {reason}'
                
                # Nustatyti tinkamą action_type pagal entity_type
                if entity_type == 'order':
                    action_type = ActivityLog.ActionType.ORDER_STATUS_CHANGED
                elif entity_type in ['sales_invoice', 'purchase_invoice']:
                    action_type = ActivityLog.ActionType.INVOICE_STATUS_CHANGED
                elif entity_type == 'order_carrier':
                    action_type = ActivityLog.ActionType.CARRIER_STATUS_CHANGED
                elif entity_type == 'order_cost':
                    action_type = ActivityLog.ActionType.COST_STATUS_CHANGED
                else:
                    action_type = ActivityLog.ActionType.CUSTOM
                
                ActivityLogService.log_action(
                    action_type=action_type,
                    description=description,
                    user=user,
                    content_object=entity,
                    metadata={
                        'entity_type': entity_type,
                        'entity_id': entity_id,
                        'old_status': old_status,
                        'new_status': new_status,
                        'reason': reason or '',
                    },
                    request=request
                )
            except Exception as e:
                logger.warning(f"Failed to log status change: {e}")
        
        return {
            'success': True,
            'old_status': old_status,
            'new_status': new_status,
            'entity': entity,
            'message': f'Statusas sėkmingai pakeistas iš {old_status} į {new_status}'
        }
    
    @staticmethod
    def _get_entity(entity_type: str, entity_id: int):
        """Gauti objektą pagal tipą ir ID"""
        if entity_type == 'order':
            from apps.orders.models import Order
            try:
                return Order.objects.get(id=entity_id)
            except Order.DoesNotExist:
                return None
        elif entity_type == 'sales_invoice':
            from apps.invoices.models import SalesInvoice
            try:
                return SalesInvoice.objects.get(id=entity_id)
            except SalesInvoice.DoesNotExist:
                return None
        elif entity_type == 'purchase_invoice':
            from apps.invoices.models import PurchaseInvoice
            try:
                return PurchaseInvoice.objects.get(id=entity_id)
            except PurchaseInvoice.DoesNotExist:
                return None
        elif entity_type == 'order_carrier':
            from apps.orders.models import OrderCarrier
            try:
                return OrderCarrier.objects.get(id=entity_id)
            except OrderCarrier.DoesNotExist:
                return None
        elif entity_type == 'order_cost':
            from apps.orders.models import OrderCost
            try:
                return OrderCost.objects.get(id=entity_id)
            except OrderCost.DoesNotExist:
                return None
        else:
            raise ValueError(f"Nežinomas entity_type: {entity_type}")
    
    @staticmethod
    def _get_current_status(entity_type: str, entity) -> str:
        """Gauti dabartinį objekto statusą"""
        if entity_type == 'order':
            return entity.status
        elif entity_type in ['sales_invoice', 'purchase_invoice']:
            return entity.payment_status
        elif entity_type == 'order_carrier':
            return entity.payment_status
        elif entity_type == 'order_cost':
            return entity.status
        else:
            raise ValueError(f"Nežinomas entity_type: {entity_type}")
    
    @staticmethod
    def _set_status(entity_type: str, entity, new_status: str):
        """Nustatyti naują objekto statusą"""
        if entity_type == 'order':
            entity.status = new_status
        elif entity_type in ['sales_invoice', 'purchase_invoice']:
            entity.payment_status = new_status
        elif entity_type == 'order_carrier':
            entity.payment_status = new_status
        elif entity_type == 'order_cost':
            entity.status = new_status
        else:
            raise ValueError(f"Nežinomas entity_type: {entity_type}")
    
    @staticmethod
    def _get_entity_name(entity_type: str) -> str:
        """Gauti objekto pavadinimą lietuviškai"""
        names = {
            'order': 'Užsakymas',
            'sales_invoice': 'Pardavimo sąskaita',
            'purchase_invoice': 'Pirkimo sąskaita',
            'order_carrier': 'Užsakymo vežėjas',
            'order_cost': 'Užsakymo išlaida',
        }
        return names.get(entity_type, entity_type)
    
    @staticmethod
    def auto_update_order_status(order_id: int, user=None, request=None) -> Optional[Dict[str, Any]]:
        """
        Automatiškai atnaujinti užsakymo statusą pagal sąlygas.
        
        Taisyklės:
        - Jei visi vežėjai gavo sąskaitas -> 'finished'
        - Jei bent vienas vežėjas laukia dokumentų -> 'waiting_for_docs'
        
        Args:
            order_id: Užsakymo ID
            user: Vartotojas (optional)
            request: Django request (optional)
        
        Returns:
            Dict su statuso pakeitimo informacija arba None jei statusas nepasikeitė
        """
        from apps.orders.models import Order, OrderCarrier
        from apps.invoices.models import PurchaseInvoice
        
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return None
        
        # Jei užsakymas jau baigtas arba atšauktas, nieko nedaryti
        if order.status in ['finished', 'canceled']:
            return None
        
        # Patikrinti vežėjų sąskaitas
        carriers = OrderCarrier.objects.filter(order=order)
        if not carriers.exists():
            return None
        
        all_received = True
        any_waiting = False
        
        for carrier in carriers:
            if carrier.partner:
                # Patikrinti ar yra gautų sąskaitų
                has_invoice = PurchaseInvoice.objects.filter(
                    related_order=order,
                    partner=carrier.partner
                ).exists() or PurchaseInvoice.objects.filter(
                    related_orders=order,
                    partner=carrier.partner
                ).exists()
                
                if not has_invoice:
                    all_received = False
                
                # Patikrinti ar laukia dokumentų
                if order.status == 'waiting_for_docs':
                    any_waiting = True
        
        # Nustatyti naują statusą
        new_status = None
        if all_received and order.status != 'finished':
            new_status = 'finished'
        elif any_waiting and order.status != 'waiting_for_docs':
            new_status = 'waiting_for_docs'
        
        if new_status:
            return StatusService.change_status(
                entity_type='order',
                entity_id=order_id,
                new_status=new_status,
                user=user,
                reason='Automatinis statuso atnaujinimas pagal vežėjų sąskaitų būseną',
                request=request,
                skip_validation=True  # Automatinis perėjimas
            )
        
        return None
