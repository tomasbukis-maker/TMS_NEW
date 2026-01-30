from django.urls import path
from .views import dashboard_statistics, clients_with_overdue_invoices, carriers_with_overdue_invoices

urlpatterns = [
    path('statistics/', dashboard_statistics, name='dashboard-statistics'),
    path('clients-overdue/', clients_with_overdue_invoices, name='clients-overdue'),
    path('carriers-overdue/', carriers_with_overdue_invoices, name='carriers-overdue'),
]





