from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.translation import gettext_lazy as _


class Role(models.Model):
    """Rolių modelis"""
    
    class RoleType(models.TextChoices):
        ADMINISTRATORIUS = 'administratorius', _('Administratorius')
        VADYBININKAS = 'vadybininkas', _('Vadybininkas')
        BUHALTERIS = 'buhalteris', _('Buhalteris/Finansai')
    
    name = models.CharField(
        max_length=50,
        choices=RoleType.choices,
        unique=True,
        verbose_name=_('Rolė')
    )
    description = models.TextField(blank=True, verbose_name=_('Aprašymas'))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'roles'
        verbose_name = _('Rolė')
        verbose_name_plural = _('Rolės')
        indexes = [
            models.Index(fields=['name']),
        ]
    
    def __str__(self):
        return self.get_name_display()


class Permission(models.Model):
    """Teisių modelis"""
    
    name = models.CharField(max_length=100, unique=True, verbose_name=_('Pavadinimas'))
    codename = models.CharField(max_length=100, unique=True, verbose_name=_('Kodas'))
    description = models.TextField(blank=True, verbose_name=_('Aprašymas'))
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'permissions'
        verbose_name = _('Teisė')
        verbose_name_plural = _('Teisės')
        indexes = [
            models.Index(fields=['codename']),
        ]
    
    def __str__(self):
        return self.name


class RolePermission(models.Model):
    """Rolių ir teisių ryšio lentelė"""
    
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='role_permissions')
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE, related_name='role_permissions')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'role_permissions'
        unique_together = ['role', 'permission']
        verbose_name = _('Rolės teisė')
        verbose_name_plural = _('Rolių teisės')
    
    def __str__(self):
        return f"{self.role.name} - {self.permission.name}"


class User(AbstractUser):
    """Papildytas vartotojo modelis su rolių palaikymu"""
    
    # Perrašome groups ir user_permissions, kad išvengtume konflikto su django.contrib.auth
    groups = models.ManyToManyField(
        'auth.Group',
        verbose_name=_('groups'),
        blank=True,
        help_text=_('The groups this user belongs to.'),
        related_name='tms_user_set',
        related_query_name='tms_user',
    )
    user_permissions = models.ManyToManyField(
        'auth.Permission',
        verbose_name=_('user permissions'),
        blank=True,
        help_text=_('Specific permissions for this user.'),
        related_name='tms_user_set',
        related_query_name='tms_user',
    )
    
    role = models.ForeignKey(
        Role,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users',
        verbose_name=_('Rolė')
    )
    phone = models.CharField(max_length=20, blank=True, verbose_name=_('Telefonas'))
    position = models.CharField(max_length=100, blank=True, verbose_name=_('Pareigos'))
    is_active = models.BooleanField(default=True, verbose_name=_('Aktyvus'))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'users'
        verbose_name = _('Vartotojas')
        verbose_name_plural = _('Vartotojai')
        indexes = [
            models.Index(fields=['username']),
            models.Index(fields=['email']),
            models.Index(fields=['role']),
        ]
    
    def __str__(self):
        return f"{self.username} ({self.role.name if self.role else 'Be rolės'})"
    
    def has_permission(self, codename):
        """Patikrina ar vartotojas turi nurodytą teisę per savo rolę"""
        if not self.role:
            return False
        return self.role.role_permissions.filter(permission__codename=codename).exists()

