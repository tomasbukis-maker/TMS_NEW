"""
Modulinė testinių duomenų ištrynimo koordinatorius.
Kviečia kiekvieno modulio deleters.
"""

from django.conf import settings
import logging

logger = logging.getLogger(__name__)


def delete_all_test_data():
    """
    Ištrina visus testinius duomenis naudojant modulinių deleters sistemą.
    
    Returns:
        dict: Statistika ištrintų duomenų
    """
    if not settings.DEBUG:
        raise ValueError("Testinių duomenų ištrynimas leidžiamas tik DEBUG=True režime!")
    
    stats = {
        'orders_deleted': 0,
        'invoices_deleted': 0,
        'errors': []
    }
    
    try:
        # Importuoti modulių deleters
        from apps.invoices.test_data import delete_invoices_test_data
        from apps.orders.test_data import delete_orders_test_data
        
        # Ištrinti sąskaitas pirmiausia (dėl ForeignKey dependencies)
        logger.info("Ištrinamos testinės sąskaitos...")
        invoices_result = delete_invoices_test_data()
        stats['invoices_deleted'] = invoices_result.get('deleted', 0)
        
        if invoices_result.get('errors'):
            stats['errors'].extend(invoices_result['errors'])
        
        # Ištrinti užsakymus
        logger.info("Ištrinami testiniai užsakymai...")
        orders_result = delete_orders_test_data()
        stats['orders_deleted'] = orders_result.get('deleted', 0)
        
        if orders_result.get('errors'):
            stats['errors'].extend(orders_result['errors'])
        
        logger.info(f"Testinių duomenų ištrynimas baigtas: {stats['orders_deleted']} užsakymų, {stats['invoices_deleted']} sąskaitų")
        
    except ImportError as e:
        error_msg = f"Modulių deleters importavimo klaida: {str(e)}"
        logger.error(error_msg)
        stats['errors'].append(error_msg)
        raise
    except Exception as e:
        error_msg = f"Testinių duomenų ištrynimo klaida: {str(e)}"
        logger.error(error_msg, exc_info=True)
        stats['errors'].append(error_msg)
        raise
    
    return stats






