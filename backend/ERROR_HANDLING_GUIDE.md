# Error Handling Improvement Guide

## ❌ **Problemos dabartiniame kode**

### 1. Bendras `except Exception: pass` - slepia klaidas
```python
# BAD ❌
try:
    order_date_str = order.order_date.strftime('%Y.%m.%d')
except Exception:
    pass  # Kas atsitiko? Kodėl nepavyko? Nežinome!
```

### 2. Per platus exception catching
```python
# BAD ❌
try:
    result = complex_operation()
except Exception as e:
    logger.error(f"Error: {e}")  # Per daug gaudome
```

### 3. Nebaigiama exception chain
```python
# BAD ❌
try:
    do_something()
except ValueError as e:
    raise Exception("Something went wrong")  # Prarandame originalią klaidą!
```

---

## ✅ **Teisingi Error Handling Pattern'ai**

### Pattern 1: Specific Exceptions
```python
# GOOD ✅
try:
    order_date_str = order.order_date.strftime('%Y.%m.%d')
except AttributeError:
    # order.order_date is None
    order_date_str = "N/A"
except (TypeError, ValueError) as e:
    # Netinkamas date formatas
    logger.warning(f"Invalid date format for order {order.id}: {e}")
    order_date_str = "Invalid Date"
```

### Pattern 2: Reraise su kontekstu
```python
# GOOD ✅
try:
    invoice = create_invoice(order)
except IntegrityError as e:
    logger.error(f"Database integrity error creating invoice for order {order.id}: {e}", exc_info=True)
    raise ValidationError("Nepavyko sukurti sąskaitos - dublika jau egzistuoja") from e
```

### Pattern 3: Custom Exception Classes
```python
# GOOD ✅
class InvoiceNumberExistsError(Exception):
    """Sąskaitos numeris jau egzistuoja"""
    pass

class InvoiceGenerationError(Exception):
    """Bendroji sąskaitos generavimo klaida"""
    pass

try:
    invoice_number = generate_invoice_number()
except InvoiceNumberExistsError:
    # Specifinis handling
    invoice_number = generate_invoice_number_with_suffix()
except InvoiceGenerationError as e:
    # Bendresnė klaida
    logger.error(f"Could not generate invoice: {e}")
    raise
```

### Pattern 4: Graceful Degradation
```python
# GOOD ✅
try:
    logo_base64 = convert_logo_to_base64(company.logo)
except (FileNotFoundError, IOError) as e:
    logger.warning(f"Logo file not found or unreadable: {e}")
    logo_base64 = None  # Tęsti be logo
except Exception as e:
    logger.error(f"Unexpected error converting logo: {e}", exc_info=True)
    logo_base64 = None
```

---

## 🔧 **Konkrečios pataisos kodui**

### Fix 1: `invoices/utils.py` - Date formatting

**Prieš:**
```python
try:
    if isinstance(order.order_date, datetime):
        order_desc_parts.append(f"Užsakymo data: {order.order_date.strftime('%Y.%m.%d')}")
    elif isinstance(order.order_date, date):
        order_desc_parts.append(f"Užsakymo data: {order.order_date.strftime('%Y.%m.%d')}")
except Exception:
    pass  # ❌
```

**Po:**
```python
if order.order_date:
    try:
        if isinstance(order.order_date, datetime):
            date_str = order.order_date.strftime('%Y.%m.%d')
        elif isinstance(order.order_date, date):
            date_str = order.order_date.strftime('%Y.%m.%d')
        else:
            # Unexpected type
            logger.warning(f"Unexpected order_date type: {type(order.order_date)}")
            date_str = str(order.order_date)
        order_desc_parts.append(f"Užsakymo data: {date_str}")
    except (AttributeError, ValueError) as e:
        logger.warning(f"Could not format order date for order {order.id}: {e}")
        # Continue without date
```

### Fix 2: `invoices/views.py` - Logo conversion

**Prieš:**
```python
try:
    logo_base64 = base64.b64encode(logo_content).decode('utf-8')
except Exception as logo_error:
    logger.error(f"Logo conversion error: {logo_error}")
    logo_base64 = None  # ❌ Per platus catch
```

**Po:**
```python
try:
    logo_base64 = base64.b64encode(logo_content).decode('utf-8')
except (TypeError, ValueError) as e:
    logger.error(f"Invalid logo data format: {e}")
    logo_base64 = None
except UnicodeDecodeError as e:
    logger.error(f"Logo encoding error: {e}")
    logo_base64 = None
except Exception as e:
    # Truly unexpected error
    logger.error(f"Unexpected error encoding logo: {e}", exc_info=True)
    logo_base64 = None
```

### Fix 3: `orders/views.py` - Database recovery

**Prieš:**
```python
except Exception as e:
    logger.error(f"Database connection error: {e}")
    try:
        connection.close()
    except Exception as recovery_error:
        logger.error(f"Connection recovery failed: {recovery_error}")  # ❌
```

**Po:**
```python
except OperationalError as e:
    logger.error(f"Database connection lost: {e}")
    try:
        connection.close()
        connection.connect()
    except OperationalError as recovery_error:
        logger.critical(f"Cannot recover database connection: {recovery_error}", exc_info=True)
        raise DatabaseUnavailableError("Sistema laikinai nepasiekiama") from e
except DatabaseError as e:
    logger.error(f"Database error: {e}", exc_info=True)
    raise
```

---

## 📋 **Custom Exceptions Katalas**

### backend/apps/core/exceptions.py (sukurti naują failą)
```python
"""
Custom exception classes for TMS application
"""

class TMSBaseException(Exception):
    """Base exception for all TMS-specific errors"""
    pass

class DatabaseUnavailableError(TMSBaseException):
    """Database is temporarily unavailable"""
    pass

class InvoiceGenerationError(TMSBaseException):
    """Error generating invoice number"""
    pass

class InvoiceNumberExistsError(InvoiceGenerationError):
    """Invoice number already exists"""
    pass

class OrderValidationError(TMSBaseException):
    """Order validation failed"""
    pass

class PartnerImportError(TMSBaseException):
    """Partner import from CSV failed"""
    pass

class PDFGenerationError(TMSBaseException):
    """PDF generation failed"""
    pass
```

---

## 🎯 **Prioritetinis taisymo sąrašas**

### P0 - Critical (taisyti dabar)
1. ✅ `invoices/utils.py`, line 39-61: Date formatting - 3 instances
2. ⏳ `invoices/utils.py`, line 160: Order data parsing
3. ⏳ `invoices/utils.py`, line 479: Sequence creation race condition
4. ⏳ `orders/views.py`, line 383: Database recovery

### P1 - High (taisyti šią savaitę)
5. ⏳ `invoices/serializers.py`: Multiple `except Exception: pass` (6 instances)
6. ⏳ `invoices/views.py`: Logo/image handling (3 instances)
7. ⏳ `orders/serializers.py`: Autocomplete saving errors

### P2 - Medium (taisyti šį mėnesį)
8. ⏳ Visi `except Exception as e` logging only cases
9. ⏳ Management commands error handling
10. ⏳ Test data generators

---

## 🧪 **Testing Error Handling**

### Unit Test Example
```python
# test_invoice_utils.py
import pytest
from apps.invoices.utils import _generate_invoice_items_structure
from apps.invoices.exceptions import OrderDataError

def test_generate_invoice_items_with_invalid_date():
    """Test graceful handling of invalid order date"""
    order = Order(
        id=1,
        order_date="invalid",  # String instead of date
        route_from="Vilnius",
        route_to="Kaunas"
    )
    invoice = SalesInvoice(related_order=order, vat_rate=21)
    
    # Should not raise, should handle gracefully
    items = _generate_invoice_items_structure(invoice)
    assert len(items) > 0
    # Date should be omitted or handled safely
    assert "Invalid" not in items[0]['description']

def test_generate_invoice_number_duplicate():
    """Test handling of duplicate invoice numbers"""
    # Create invoice with LOG0000001
    SalesInvoice.objects.create(invoice_number="LOG0000001", ...)
    
    # Mock sequence to return same number
    with patch('apps.invoices.utils.InvoiceNumberSequence') as mock_seq:
        mock_seq.objects.get.return_value.last_number = 1
        
        # Should detect duplicate and generate next number
        number = generate_invoice_number(prefix="LOG", width=7)
        assert number == "LOG0000002"
```

---

## 📊 **Error Monitoring & Alerting**

### 1. Sentry Integration
```python
# settings.py
import sentry_sdk

sentry_sdk.init(
    dsn="YOUR_SENTRY_DSN",
    traces_sample_rate=0.1,
    profiles_sample_rate=0.1,
)

# Automatic exception tracking
```

### 2. Custom Error Metrics
```python
# middleware.py
class ErrorMetricsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.error_count = Counter()
    
    def __call__(self, request):
        try:
            response = self.get_response(request)
            return response
        except Exception as e:
            error_type = type(e).__name__
            self.error_count[error_type] += 1
            logger.error(f"Request error [{error_type}]: {e}", exc_info=True)
            raise
```

---

## ✅ **Checklist po taisymo**

- [ ] Visi `except Exception: pass` pakeisti į specific exceptions arba turi logging
- [ ] Kritinės vietos turi graceful degradation
- [ ] Sukurtos custom exception classes
- [ ] Pridėti unit testai error cases
- [ ] Patikrinta su Sentry/monitoring
- [ ] Dokumentuota Error Handling guide API dokumentacijoje

---

## 📚 **Resources**

- [Python Exception Best Practices](https://docs.python.org/3/tutorial/errors.html)
- [Django Error Handling](https://docs.djangoproject.com/en/4.2/topics/db/transactions/#controlling-transactions-explicitly)
- [Sentry Django Integration](https://docs.sentry.io/platforms/python/guides/django/)

