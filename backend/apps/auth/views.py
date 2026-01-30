from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.db import OperationalError, DatabaseError, connection
import logging
from .serializers import (
    UserSerializer, UserCreateSerializer, PasswordChangeSerializer,
    CustomTokenObtainPairSerializer, RoleSerializer
)
from .models import Role
from .permissions import IsAdministrator

User = get_user_model()
logger = logging.getLogger(__name__)


class UserViewSet(viewsets.ModelViewSet):
    """Vartotojų CRUD operacijos"""
    queryset = User.objects.select_related('role').order_by('username').all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdministrator]
    search_fields = ['username', 'email', 'first_name', 'last_name']
    ordering_fields = ['created_at', 'username']
    ordering = ['username']  # Default ordering, kad būtų consistent pagination
    
    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer
    
    @action(detail=False, methods=['get'])
    def me(self, request):
        """Grąžina prisijungusio vartotojo informaciją"""
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def change_password(self, request):
        """Slaptažodžio keitimo endpoint"""
        serializer = PasswordChangeSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            request.user.set_password(serializer.validated_data['new_password'])
            request.user.save()
            return Response({"message": "Slaptažodis sėkmingai pakeistas."}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginView(TokenObtainPairView):
    """Prisijungimo endpoint"""
    serializer_class = CustomTokenObtainPairSerializer
    
    def post(self, request, *args, **kwargs):
        """Prisijungimo metodas su DB klaidos apdorojimu"""
        try:
            # Patikrinti DB ryšį prieš bandant prisijungti
            connection.ensure_connection()
        except (OperationalError, DatabaseError) as e:
            logger.error(f"DB ryšio klaida prisijungimo metu: {e}", exc_info=True)
            return Response(
                {
                    "error": "Nepavyko prisijungti prie duomenų bazės. Patikrinkite ar duomenų bazės serveris veikia ir ar SSH tunelis (jei naudojamas) yra aktyvus.",
                    "detail": "Database connection error",
                    "type": "database_error"
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except Exception as e:
            logger.error(f"Netikėta klaida tikrinant DB ryšį: {e}", exc_info=True)
            return Response(
                {
                    "error": "Klaida jungiantis prie duomenų bazės.",
                    "detail": str(e),
                    "type": "database_error"
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        
        # Jei DB ryšys veikia, tęsti normalų prisijungimą
        try:
            return super().post(request, *args, **kwargs)
        except (OperationalError, DatabaseError) as e:
            logger.error(f"DB klaida autentifikuojant vartotoją: {e}", exc_info=True)
            return Response(
                {
                    "error": "Nepavyko prisijungti prie duomenų bazės. Patikrinkite ar duomenų bazės serveris veikia ir ar SSH tunelis (jei naudojamas) yra aktyvus.",
                    "detail": "Database connection error during authentication",
                    "type": "database_error"
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )


class LogoutView(viewsets.ViewSet):
    """Atsijungimo endpoint"""
    permission_classes = [permissions.IsAuthenticated]
    
    def create(self, request):
        try:
            refresh_token = request.data.get("refresh_token")
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
            return Response({"message": "Sėkmingai atsijungta."}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": "Klaida atsijungiant."}, status=status.HTTP_400_BAD_REQUEST)


class RoleViewSet(viewsets.ReadOnlyModelViewSet):
    """Rolių sąrašas (tik skaitymas)"""
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [permissions.IsAuthenticated]

