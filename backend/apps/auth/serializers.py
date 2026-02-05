from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth.password_validation import validate_password
from .models import User, Role, Permission


class RoleSerializer(serializers.ModelSerializer):
    """Rolės serializer"""
    
    class Meta:
        model = Role
        fields = ['id', 'name', 'description']
        read_only_fields = ['id']


class UserSerializer(serializers.ModelSerializer):
    """Vartotojo serializer"""
    role = RoleSerializer(read_only=True)
    role_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    full_name = serializers.SerializerMethodField()
    company_name = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'full_name',
            'role', 'role_id', 'phone', 'position', 'is_active', 'created_at', 'company_name'
        ]
        read_only_fields = ['id', 'created_at', 'full_name', 'company_name']
        extra_kwargs = {
            'password': {'write_only': True, 'required': False},
        }
    
    def get_full_name(self, obj):
        """Grąžina pilną vardą iš UserSettings arba username"""
        try:
            user_settings = obj.user_settings
            if user_settings.first_name or user_settings.last_name:
                return f"{user_settings.first_name} {user_settings.last_name}".strip()
        except:
            pass
        return obj.username
    
    def get_company_name(self, obj):
        """Grąžina įmonės pavadinimą"""
        try:
            from apps.settings.models import CompanyInfo
            company = CompanyInfo.load()
            return company.name if company else None
        except:
            return None

    def _assign_role(self, instance, role_id):
        if role_id in (None, '', 'null'):
            instance.role = None
        else:
            try:
                role = Role.objects.get(pk=role_id)
                instance.role = role
            except Role.DoesNotExist:
                raise serializers.ValidationError({'role_id': 'Nurodyta rolė nerasta.'})

    def update(self, instance, validated_data):
        role_id = validated_data.pop('role_id', None)
        self._assign_role(instance, role_id)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance

    def create(self, validated_data):
        role_id = validated_data.pop('role_id', None)
        password = validated_data.pop('password', None)
        user = User.objects.create(**validated_data)
        if password:
            user.set_password(password)
        self._assign_role(user, role_id)
        user.save()
        return user


class UserCreateSerializer(serializers.ModelSerializer):
    """Vartotojo kūrimo serializer"""
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True, required=True)
    
    class Meta:
        model = User
        fields = [
            'username', 'email', 'password', 'password_confirm',
            'first_name', 'last_name', 'role_id', 'phone', 'position'
        ]
    
    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({"password": "Slaptažodžiai nesutampa."})
        return attrs
    
    def create(self, validated_data):
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        role_id = validated_data.pop('role_id', None)
        user = User.objects.create_user(**validated_data)
        user.set_password(password)
        if role_id:
            try:
                user.role = Role.objects.get(pk=role_id)
            except Role.DoesNotExist:
                raise serializers.ValidationError({"role_id": "Nurodyta rolė nerasta."})
        user.save()
        return user


class PasswordChangeSerializer(serializers.Serializer):
    """Slaptažodžio keitimo serializer"""
    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True, validators=[validate_password])
    new_password_confirm = serializers.CharField(required=True, write_only=True)
    
    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({"new_password": "Nauji slaptažodžiai nesutampa."})
        return attrs
    
    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError("Neteisingas senas slaptažodis.")
        return value


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Papildytas JWT token serializer su papildoma informacija"""
    default_error_messages = {
        "no_active_account": "Neteisingas vartotojo vardas arba slaptažodis. Patikrinkite ar paskyra aktyvi."
    }

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['username'] = user.username
        try:
            token['role'] = user.role.name if hasattr(user, 'role') and user.role else None
        except AttributeError:
            token['role'] = None
        token['user_id'] = user.id
        return token

    def validate(self, attrs):
        # Jei vartotojas egzistuoja bet is_active=False, o slaptažodis teisingas – aktyvinti (patogumui po DB sync)
        username = attrs.get(self.username_field) or attrs.get("username")
        password = attrs.get("password")
        if username and password:
            try:
                u = User.objects.get(**{User.USERNAME_FIELD: username})
                if not u.is_active and u.check_password(password):
                    u.is_active = True
                    u.save(update_fields=["is_active"])
            except User.DoesNotExist:
                pass
        try:
            data = super().validate(attrs)
        except AuthenticationFailed:
            raise serializers.ValidationError({"detail": self.error_messages["no_active_account"]})
        data["user"] = UserSerializer(self.user).data
        return data

