"""
Modulinė testinių duomenų generatorių koordinatorius.
Kviečia kiekvieno modulio generatorius.
"""

from django.conf import settings
from django.utils import timezone
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)


def generate_all_test_data(count: int = 100):
    """
    Generuoja visus testinius duomenis naudojant modulinių generatorių sistemą.
    
    Args:
        count: Užsakymų skaičius (default: 100)
    
    Returns:
        dict: Statistika sugeneruotų duomenų
    """
    if not settings.DEBUG:
        raise ValueError("Testinių duomenų generavimas leidžiamas tik DEBUG=True režime!")
    
    stats = {
        'orders': 0,
        'invoices': 0,
        'errors': []
    }
    
    try:
        # Importuoti modulių generatorius
        from apps.orders.test_data import generate_orders_test_data
        from apps.invoices.test_data import generate_invoices_test_data
        
        # Generuoti užsakymus
        logger.info(f"Generuojami {count} testinių užsakymų...")
        orders_result = generate_orders_test_data(count)
        stats['orders'] = orders_result.get('created', 0)
        stats['order_ids'] = orders_result.get('order_ids', [])
        
        if orders_result.get('errors'):
            stats['errors'].extend(orders_result['errors'])
        
        # Generuoti sąskaitas (priklauso nuo užsakymų)
        logger.info("Generuojamos testinės sąskaitos...")
        invoices_result = generate_invoices_test_data(
            order_ids=stats['order_ids'],
            count_per_order=2  # ~2 sąskaitos per užsakymą
        )
        stats['invoices'] = invoices_result.get('created', 0)
        stats['invoice_ids'] = invoices_result.get('invoice_ids', [])
        
        if invoices_result.get('errors'):
            stats['errors'].extend(invoices_result['errors'])
        
        logger.info(f"Testinių duomenų generavimas baigtas: {stats['orders']} užsakymų, {stats['invoices']} sąskaitų")
        
    except ImportError as e:
        error_msg = f"Modulių generatorių importavimo klaida: {str(e)}"
        logger.error(error_msg)
        stats['errors'].append(error_msg)
        raise
    except Exception as e:
        error_msg = f"Testinių duomenų generavimo klaida: {str(e)}"
        logger.error(error_msg, exc_info=True)
        stats['errors'].append(error_msg)
        raise
    
    return stats






