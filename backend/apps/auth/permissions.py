from rest_framework.permissions import BasePermission
from .models import Role


class IsAdministrator(BasePermission):
    """Leidžia prieigą tik vartotojams su administratoriaus role."""

    message = 'Ši funkcija pasiekiama tik administratoriui.'

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        role = getattr(user, 'role', None)
        return bool(role and role.name == Role.RoleType.ADMINISTRATORIUS)

