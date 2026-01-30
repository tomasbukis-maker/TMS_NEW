"""
URL configuration for tms_project project.
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse, HttpResponse
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.auth.urls')),
    path('api/partners/', include('apps.partners.urls')),
    path('api/orders/', include('apps.orders.urls')),
    path('api/invoices/', include('apps.invoices.urls')),
    path('api/expenses/', include('apps.expenses.urls')),
    path('api/settings/', include('apps.settings.urls')),
    path('api/dashboard/', include('apps.dashboard.urls')),
    path('api/tools/', include('apps.tools.urls')),
    path('api/core/', include('apps.core.urls')),
    path('api/mail/', include('apps.mail.urls')),
    # Health check
    path('api/ping/', lambda request: JsonResponse({'status': 'ok'})),
    # Root info
    path('', lambda request: HttpResponse(b'API OK')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)


    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

