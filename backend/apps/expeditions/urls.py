from django.urls import path
from . import views

urlpatterns = [
    path('', views.expedition_list, name='expedition-list'),
]
