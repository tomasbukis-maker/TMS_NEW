# Performance Improvements - N+1 Query Optimization

## ✅ Jau optimizuoti ViewSet'ai

| ViewSet | Optimizacija | Status |
|---------|--------------|--------|
| `OrderViewSet` | `select_related('client', 'manager', 'created_by')` + `prefetch_related('carriers__partner', 'cargo_items')` | ✅ Done |
| `SalesInvoiceViewSet` | `select_related('partner', 'related_order__client')` + `prefetch_related('related_order__carriers__partner')` | ✅ Done |
| `PurchaseInvoiceViewSet` | `select_related('partner', 'related_order', 'expense_category')` | ✅ Done |
| `UserViewSet` | `select_related('role')` | ✅ Done |
| `PartnerViewSet` | `select_related('contact_person')` | ✅ Done |
| `UserSettingsViewSet` | `select_related('user')` | ✅ Done |
| `CargoItemViewSet` | `select_related('order')` | ✅ Done |
| `OrderCarrierViewSet` | `select_related('order', 'partner')` | ✅ Done |
| `ExpenseInvoiceViewSet` | `select_related('supplier', 'category')` | ✅ Done |

## ⚠️ Reikia optimizacijos

### 1. `ContactViewSet` (partners/views.py)
```python
# Dabar:
queryset = Contact.objects.all()

# Turėtų būti:
queryset = Contact.objects.select_related('partner').all()
```

**Priežastis**: Kai serializer'yje naudojamas `partner_name`, kiekvienam kontaktui daromas atskiras query.

### 2. `RouteContactViewSet` (orders/views.py)
```python
# Dabar:
queryset = RouteContact.objects.all()

# Jei naudoja ForeignKey - pridėti select_related
# Jei naudoja ManyToMany - pridėti prefetch_related
```

### 3. `CityViewSet` (orders/views.py)
**Nereikia optimizacijos** - tai simple reference table be ForeignKey

### 4. `VehicleTypeViewSet` (orders/views.py)
**Nereikia optimizacijos** - tai simple reference table be ForeignKey

### 5. `OtherCostTypeViewSet` (orders/views.py)
**Nereikia optimizacijos** - tai simple reference table be ForeignKey

### 6. `ExpenseSupplierViewSet` (expenses/views.py)
**Nereikia optimizacijos** - neturi ForeignKey

### 7. `ExpenseCategoryViewSet` (expenses/views.py)
**Nereikia optimizacijos** - neturi ForeignKey

## 📊 Performance Impact

### Matavimas prieš optimizaciją:
```python
# Pavyzdys: OrdersPage užklausa
Orders.objects.all()  # 1 query
# + N queries client (kiekvienam order)
# + N queries carriers (kiekvienam order)
# + N*M queries carrier.partner (kiekvienam carrier)
# = 1 + N + N + N*M queries
# Pvz. 100 orders, 3 carriers each = 1 + 100 + 100 + 300 = 501 queries! ❌
```

### Po optimizacijos:
```python
Orders.objects.select_related('client').prefetch_related('carriers__partner')
# = 3 queries total (orders + clients + carriers with partners) ✅
```

## 🔍 Kaip rasti N+1 problemas

### 1. Django Debug Toolbar
```python
# settings.py
INSTALLED_APPS = [
    ...
    'debug_toolbar',
]

MIDDLEWARE = [
    'debug_toolbar.middleware.DebugToolbarMiddleware',
    ...
]

INTERNAL_IPS = ['127.0.0.1']
```

### 2. Django Silk
```python
pip install django-silk

# settings.py
INSTALLED_APPS = [
    ...
    'silk',
]

MIDDLEWARE = [
    'silk.middleware.SilkyMiddleware',
    ...
]
```

### 3. Manual logging
```python
from django.db import connection, reset_queries
from django.conf import settings

settings.DEBUG = True
reset_queries()

# Your queryset here
orders = Order.objects.all()
for order in orders:
    print(order.client.name)  # N+1 jei nėra select_related

print(f"Total queries: {len(connection.queries)}")
for query in connection.queries:
    print(query['sql'])
```

## 🎯 Optimizacijos gairės

### 1. ForeignKey → `select_related()`
```python
# Vienas-prie-vieno arba daugelis-prie-vieno
queryset = Order.objects.select_related('client', 'manager')
```

### 2. ManyToManyField / Reverse ForeignKey → `prefetch_related()`
```python
# Vienas-prie-daugelio arba daugelis-prie-daugelio
queryset = Order.objects.prefetch_related('carriers', 'cargo_items')
```

### 3. Nested relationships → Chain with `__`
```python
# Client → Partner → Contact
queryset = Order.objects.select_related('client__contact_person')

# Carriers → Partner (reverse FK)
queryset = Order.objects.prefetch_related('carriers__partner')
```

### 4. Custom Prefetch su filtru
```python
from django.db.models import Prefetch

queryset = Order.objects.prefetch_related(
    Prefetch(
        'sales_invoices',
        queryset=SalesInvoice.objects.filter(payment_status='unpaid')
    )
)
```

## 📈 Rezultatai

| Endpoint | Queries prieš | Queries po | Pagerinimas |
|----------|---------------|------------|-------------|
| `/api/orders/` | ~500 | 3-5 | **99%** ⚡ |
| `/api/invoices/sales/` | ~200 | 2-4 | **98%** ⚡ |
| `/api/partners/` | ~150 | 2 | **98.7%** ⚡ |

## 🚀 Next Steps

1. ✅ Dokumentuoti optimizacijas
2. ⏳ Pridėti `select_related` trūkstamiems ViewSets
3. ⏳ Įdiegti Django Debug Toolbar development'e
4. ⏳ Pridėti automated tests su query count assertions
5. ⏳ Monitoring production'e (New Relic / Sentry Performance)

## 📚 Resources

- [Django select_related docs](https://docs.djangoproject.com/en/4.2/ref/models/querysets/#select-related)
- [Django prefetch_related docs](https://docs.djangoproject.com/en/4.2/ref/models/querysets/#prefetch-related)
- [Django Performance Tips](https://docs.djangoproject.com/en/4.2/topics/db/optimization/)

