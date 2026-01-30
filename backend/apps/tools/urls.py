from django.urls import path
from .views import FullDatabaseExportView, InfotransOrdersImportView, InfotransOrdersDeleteView, PaymentImportView

app_name = 'tools'

urlpatterns = [
    path('export/full-db/', FullDatabaseExportView.as_view(), name='export-full-db'),
    path('import/infotrans-orders/', InfotransOrdersImportView.as_view(), name='import-infotrans-orders'),
    path('import/infotrans-orders/delete/', InfotransOrdersDeleteView.as_view(), name='delete-infotrans-orders'),
    path('import/payments/', PaymentImportView.as_view(), name='import-payments'),
]
