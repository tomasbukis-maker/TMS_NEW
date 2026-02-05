import imaplib
import logging
import socket
from smtplib import SMTPException

from django.contrib.auth import update_session_auth_hash
from django.core.exceptions import ValidationError
from django.core.mail import EmailMessage, get_connection
from django.core.validators import validate_email
from apps.mail.email_logger import send_email_message_with_logging
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from .models import (
    CompanyInfo,
    UserSettings,
    InvoiceSettings,
    OrderSettings,
    OrderAutoStatusSettings,
    OrderAutoStatusRule,
    ExpeditionSettings,
    WarehouseExpeditionSettings,
    CostExpeditionSettings,
    PVMRate,
    NotificationSettings,
    UISettings,
    EmailTemplate,
)
from .serializers import (
    CompanyInfoSerializer,
    UserSettingsSerializer,
    InvoiceSettingsSerializer,
    OrderSettingsSerializer,
    OrderAutoStatusSettingsSerializer,
    OrderAutoStatusRuleSerializer,
    ExpeditionSettingsSerializer,
    WarehouseExpeditionSettingsSerializer,
    CostExpeditionSettingsSerializer,
    PVMRateSerializer,
    NotificationSettingsSerializer,
    UISettingsSerializer,
    EmailTemplateSerializer,
)

logger = logging.getLogger(__name__)


class CompanyInfoViewSet(viewsets.ModelViewSet):
    """Įmonės rekvizitų CRUD operacijos"""
    queryset = CompanyInfo.objects.all()
    serializer_class = CompanyInfoSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        # Visada grąžiname vienintelį įrašą
        CompanyInfo.load()
        return CompanyInfo.objects.filter(pk=1)
    
    def get_serializer_context(self):
        """Prideda request į serializer context (logo_url reikia)"""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    @action(detail=False, methods=['get', 'put'])
    def current(self, request):
        """Grąžina arba atnaujina esamą įmonės informaciją"""
        company_info = CompanyInfo.load()
        
        if request.method == 'GET':
            serializer = self.get_serializer(company_info, context={'request': request})
            return Response(serializer.data)
        
        elif request.method == 'PUT':
            serializer = self.get_serializer(company_info, data=request.data, partial=True, context={'request': request})
            if serializer.is_valid():
                # Jei logo yra tuščias string, ištrinti logotipą
                if 'logo' in request.data and request.data['logo'] == '':
                    if company_info.logo:
                        company_info.logo.delete(save=False)
                    serializer.validated_data['logo'] = None
                
                # Išsaugoti validuotus duomenis
                serializer.save()
                # Užkrauti atnaujintą objektą
                updated_info = CompanyInfo.objects.get(pk=1)
                return Response(self.get_serializer(updated_info, context={'request': request}).data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserSettingsViewSet(viewsets.ModelViewSet):
    """Vartotojo nustatymų CRUD operacijos"""
    queryset = UserSettings.objects.select_related('user').all()
    serializer_class = UserSettingsSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    
    def get_queryset(self):
        # Vartotojas gali matyti tik savo nustatymus
        return UserSettings.objects.filter(user=self.request.user)
    
    def perform_create(self, serializer):
        # Automatiškai priskirti vartotoją
        serializer.save(user=self.request.user)
    
    @action(detail=False, methods=['get', 'put'])
    def my_settings(self, request):
        """Grąžina arba atnaujina dabartinio vartotojo nustatymus"""
        user_settings, created = UserSettings.objects.get_or_create(user=request.user)
        
        if request.method == 'GET':
            # Jei nustatymai ką tik sukurti, užpildyti iš User modelio
            if created:
                user = request.user
                user_settings.first_name = user.first_name or ''
                user_settings.last_name = user.last_name or ''
                user_settings.email = user.email or ''
                user_settings.phone = user.phone or ''
                user_settings.save()
            # Jei nustatymuose nėra duomenų, bet User modelis turi, užpildyti
            elif not user_settings.first_name and request.user.first_name:
                user = request.user
                user_settings.first_name = user.first_name
                user_settings.last_name = user.last_name or ''
                user_settings.email = user.email or ''
                user_settings.phone = user.phone or ''
                user_settings.save()
            
            serializer = self.get_serializer(user_settings, context={'request': request})
            return Response(serializer.data)
        
        elif request.method == 'PUT':
            serializer = self.get_serializer(user_settings, data=request.data, partial=True, context={'request': request})
            if serializer.is_valid():
                # Jei signature_image yra tuščias string, ištrinti paveikslėlį
                if 'signature_image' in request.data and request.data['signature_image'] == '':
                    if user_settings.signature_image:
                        user_settings.signature_image.delete(save=False)
                    serializer.validated_data['signature_image'] = None
                
                serializer.save()
                # Grąžinti atnaujintus duomenis
                updated_settings = UserSettings.objects.get(user=request.user)
                return Response(self.get_serializer(updated_settings, context={'request': request}).data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def change_password(self, request):
        """Pakeičia vartotojo slaptažodį"""
        user = request.user
        old_password = request.data.get('old_password')
        new_password = request.data.get('new_password')
        confirm_password = request.data.get('confirm_password')

        if not old_password or not new_password or not confirm_password:
            return Response({'error': 'Prašome užpildyti visus slaptažodžio laukus.'}, status=status.HTTP_400_BAD_REQUEST)

        if not user.check_password(old_password):
            return Response({'error': 'Neteisingas dabartinis slaptažodis.'}, status=status.HTTP_400_BAD_REQUEST)

        if new_password != confirm_password:
            return Response({'error': 'Nauji slaptažodžiai nesutampa.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(new_password) < 8:
            return Response({'error': 'Naujas slaptažodis turi būti ne trumpesnis nei 8 simboliai.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()
        update_session_auth_hash(request, user)

        return Response({'message': 'Slaptažodis sėkmingai pakeistas.'}, status=status.HTTP_200_OK)


class InvoiceSettingsViewSet(viewsets.ModelViewSet):
    """Sąskaitų nustatymų CRUD operacijos"""
    queryset = InvoiceSettings.objects.all()
    serializer_class = InvoiceSettingsSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        # Visada grąžiname vienintelį įrašą
        InvoiceSettings.load()
        return InvoiceSettings.objects.filter(pk=1)
    
    @action(detail=False, methods=['get', 'put'])
    def current(self, request):
        """Grąžina arba atnaujina esamus sąskaitų nustatymus"""
        invoice_settings = InvoiceSettings.load()
        
        if request.method == 'GET':
            serializer = self.get_serializer(invoice_settings)
            return Response(serializer.data)
        
        elif request.method == 'PUT':
            serializer = self.get_serializer(invoice_settings, data=request.data, partial=True)
            if serializer.is_valid():
                # Išsaugoti validuotus duomenis
                serializer.save()
                # Užkrauti atnaujintą objektą
                updated_settings = InvoiceSettings.objects.get(pk=1)
                return Response(self.get_serializer(updated_settings).data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class OrderSettingsViewSet(viewsets.ModelViewSet):
    """Užsakymų nustatymų CRUD operacijos"""
    queryset = OrderSettings.objects.all()
    serializer_class = OrderSettingsSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        OrderSettings.load()
        return OrderSettings.objects.filter(pk=1)

    @action(detail=False, methods=['get', 'put'])
    def current(self, request):
        settings_obj = OrderSettings.load()
        if request.method == 'GET':
            serializer = self.get_serializer(settings_obj)
            return Response(serializer.data)
        elif request.method == 'PUT':
            serializer = self.get_serializer(settings_obj, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                updated = OrderSettings.objects.get(pk=1)
                return Response(self.get_serializer(updated).data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# DEPRECATED: Ši sistema pakeista į OrderAutoStatusRuleViewSet
# class OrderAutoStatusSettingsViewSet(viewsets.ModelViewSet):
#     """Užsakymų automatinio statusų keitimo nustatymų CRUD operacijos"""
#     queryset = OrderAutoStatusSettings.objects.all()
#     serializer_class = OrderAutoStatusSettingsSerializer
#     permission_classes = [IsAuthenticated]
#
#     def get_queryset(self):
#         OrderAutoStatusSettings.load()
#         return OrderAutoStatusSettings.objects.filter(pk=1)
#
#     @action(detail=False, methods=['get', 'put'])
#     def current(self, request):
#         settings_obj = OrderAutoStatusSettings.load()
#         if request.method == 'GET':
#             serializer = self.get_serializer(settings_obj)
#             return Response(serializer.data)
#         elif request.method == 'PUT':
#             serializer = self.get_serializer(settings_obj, data=request.data, partial=True)
#             if serializer.is_valid():
#                 serializer.save()
#                 updated = OrderAutoStatusSettings.objects.get(pk=1)
#                 return Response(self.get_serializer(updated).data)
#             return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class OrderAutoStatusRuleViewSet(viewsets.ModelViewSet):
    """Automatinio statusų keitimo taisyklių CRUD operacijos"""
    queryset = OrderAutoStatusRule.objects.all()
    serializer_class = OrderAutoStatusRuleSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Custom ordering: priority desc, then workflow order"""
        from django.db.models import Case, When, IntegerField, Value as DBValue

        # Map status values to workflow order numbers
        workflow_order = Case(
            When(from_status='new', then=DBValue(1)),
            When(from_status='assigned', then=DBValue(2)),
            When(from_status='executing', then=DBValue(3)),
            When(from_status='waiting_for_docs', then=DBValue(4)),
            When(from_status='waiting_for_payment', then=DBValue(5)),
            When(from_status='finished', then=DBValue(6)),
            When(from_status='canceled', then=DBValue(7)),
            When(from_status='closed', then=DBValue(8)),
            default=DBValue(9),
            output_field=IntegerField()
        )

        return OrderAutoStatusRule.objects.annotate(
            workflow_order=workflow_order
        ).order_by('-priority', 'workflow_order')

    @action(detail=False, methods=['get'], url_path='apply-rules')
    def apply_rules(self, request):
        """Pritaiko statusų keitimo taisykles visiems užsakymams"""
        try:
            from django.core.management import call_command
            from io import StringIO
            import sys

            # Capture command output
            old_stdout = sys.stdout
            sys.stdout = captured_output = StringIO()

            try:
                # Run the command
                call_command('apply_status_rules', verbosity=1)
                output = captured_output.getvalue()
            finally:
                sys.stdout = old_stdout

            # Parse the output to extract summary
            lines = output.strip().split('\n')
            summary_line = None
            for line in lines:
                if line.startswith('SUMMARY:'):
                    summary_line = line
                    break

            if summary_line:
                # Extract numbers from summary
                import re
                match = re.search(r'SUMMARY: Processed (\d+) orders, Updated (\d+), Skipped (\d+)', summary_line)
                if match:
                    processed, updated, skipped = match.groups()
                    return Response({
                        'message': 'Statusų keitimo taisyklės sėkmingai pritaikytos!',
                        'processed': int(processed),
                        'updated': int(updated),
                        'skipped': int(skipped),
                        'details': output
                    }, status=status.HTTP_200_OK)

            return Response({
                'message': 'Statusų keitimo taisyklės pritaikytos',
                'details': output
            }, status=status.HTTP_200_OK)
        except Exception as e:
            import traceback
            print(f"DEBUG: Exception in apply_rules: {e}")
            print(f"DEBUG: Traceback: {traceback.format_exc()}")
            return Response({
                'error': str(e),
                'traceback': traceback.format_exc()
            }, status=status.HTTP_500_OK)


class ExpeditionSettingsViewSet(viewsets.ModelViewSet):
    """Ekspedicijos numeracijos nustatymų CRUD operacijos"""

    queryset = ExpeditionSettings.objects.all()
    serializer_class = ExpeditionSettingsSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        ExpeditionSettings.load()
        return ExpeditionSettings.objects.filter(pk=1)

    @action(detail=False, methods=['get', 'put'])
    def current(self, request):
        settings_obj = ExpeditionSettings.load()
        if request.method == 'GET':
            serializer = self.get_serializer(settings_obj)
            return Response(serializer.data)
        serializer = self.get_serializer(settings_obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            updated = ExpeditionSettings.objects.get(pk=1)
            return Response(self.get_serializer(updated).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class WarehouseExpeditionSettingsViewSet(viewsets.ModelViewSet):
    """Sandėlių ekspedicijų numeracijos nustatymų CRUD operacijos"""

    queryset = WarehouseExpeditionSettings.objects.all()
    serializer_class = WarehouseExpeditionSettingsSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        WarehouseExpeditionSettings.load()
        return WarehouseExpeditionSettings.objects.filter(pk=1)

    @action(detail=False, methods=['get', 'put'])
    def current(self, request):
        settings_obj = WarehouseExpeditionSettings.load()
        if request.method == 'GET':
            serializer = self.get_serializer(settings_obj)
            return Response(serializer.data)
        serializer = self.get_serializer(settings_obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            updated = WarehouseExpeditionSettings.objects.get(pk=1)
            return Response(self.get_serializer(updated).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CostExpeditionSettingsViewSet(viewsets.ModelViewSet):
    """Išlaidų numeracijos nustatymų CRUD operacijos"""

    queryset = CostExpeditionSettings.objects.all()
    serializer_class = CostExpeditionSettingsSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        CostExpeditionSettings.load()
        return CostExpeditionSettings.objects.filter(pk=1)

    @action(detail=False, methods=['get', 'put'])
    def current(self, request):
        settings_obj = CostExpeditionSettings.load()
        if request.method == 'GET':
            serializer = self.get_serializer(settings_obj)
            return Response(serializer.data)
        serializer = self.get_serializer(settings_obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            updated = CostExpeditionSettings.objects.get(pk=1)
            return Response(self.get_serializer(updated).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PVMRateViewSet(viewsets.ModelViewSet):
    """PVM tarifų su straipsniais CRUD operacijos"""
    queryset = PVMRate.objects.all()
    serializer_class = PVMRateSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['sequence_order', 'rate', 'created_at']
    ordering = ['sequence_order', 'rate']
    
    def get_queryset(self):
        """Galima filtruoti pagal is_active"""
        queryset = PVMRate.objects.all()
        is_active = self.request.query_params.get('is_active', None)
        if is_active is not None:
            is_active_bool = is_active.lower() == 'true'
            queryset = queryset.filter(is_active=is_active_bool)
        return queryset


class NotificationSettingsViewSet(viewsets.ModelViewSet):
    """Pranešimų nustatymų CRUD operacijos"""
    queryset = NotificationSettings.objects.all()
    serializer_class = NotificationSettingsSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        # Visada grąžiname vienintelį įrašą
        NotificationSettings.load()
        return NotificationSettings.objects.filter(pk=1)
    
    @action(detail=False, methods=['get', 'put'])
    def current(self, request):
        """Grąžina arba atnaujina esamus pranešimų nustatymus"""
        notification_settings = NotificationSettings.load()
        
        if request.method == 'GET':
            serializer = self.get_serializer(notification_settings)
            return Response(serializer.data)
        
        elif request.method == 'PUT':
            serializer = self.get_serializer(notification_settings, data=request.data, partial=True)
            if serializer.is_valid():
                # Jei slaptažodis nėra nurodytas (tuščias string), nekeisti esamo
                if 'smtp_password' in request.data and request.data['smtp_password'] == '':
                    serializer.validated_data.pop('smtp_password', None)
                if 'imap_password' in request.data and request.data['imap_password'] == '':
                    serializer.validated_data.pop('imap_password', None)
                
                serializer.save()
                # Užkrauti atnaujintą objektą
                updated_settings = NotificationSettings.objects.get(pk=1)
                return Response(self.get_serializer(updated_settings).data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='send-test-email')
    def send_test_email(self, request):
        """Išsiunčia testinį el. laišką nurodytam adresui naudojant dabartinius SMTP nustatymus."""
        email = request.data.get('email', '').strip()
        if not email:
            return Response({'error': 'Prašome įvesti el. pašto adresą.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_email(email)
        except ValidationError:
            return Response({'error': 'El. pašto adresas neteisingas.'}, status=status.HTTP_400_BAD_REQUEST)

        config = NotificationSettings.load()

        if not config.smtp_enabled:
            return Response({'error': 'SMTP siuntimas nėra įjungtas. Įjunkite „Įjungti el. laiškų siuntimą“ ir išsaugokite nustatymus.'},
                            status=status.HTTP_400_BAD_REQUEST)

        missing_fields = []
        if not config.smtp_host:
            missing_fields.append('SMTP serveris')
        if not config.smtp_port:
            missing_fields.append('SMTP portas')
        if not config.smtp_username:
            missing_fields.append('SMTP naudotojas')
        if not config.smtp_password:
            missing_fields.append('SMTP slaptažodis')
        if not config.smtp_from_email:
            missing_fields.append('Numatytasis siuntėjas (el. paštas)')

        if missing_fields:
            return Response(
                {'error': 'Nepakanka SMTP nustatymų. Trūksta laukų: ' + ', '.join(missing_fields)},
                status=status.HTTP_400_BAD_REQUEST
            )

        use_tls = bool(config.smtp_use_tls)
        use_ssl = False
        if not use_tls and config.smtp_port in (465, 587):
            # Jei TLS nepanaudojamas, o portas atitinka SSL – bandome su SSL
            use_ssl = config.smtp_port == 465

        subject = 'Logi-Track TMS – testinis laiškas'
        body = (
            'Sveiki,\n\n'
            'Tai testinis el. laiškas iš Logi-Track TMS sistemos. '
            'Jei gavote šį laišką, SMTP nustatymai sukonfigūruoti teisingai.\n\n'
            'Pagarbiai,\n'
            'Logi-Track TMS'
        )
        from_email = f"{config.smtp_from_name or 'Logi-Track TMS'} <{config.smtp_from_email}>"

        try:
            connection = get_connection(
                backend='django.core.mail.backends.smtp.EmailBackend',
                host=config.smtp_host,
                port=config.smtp_port,
                username=config.smtp_username,
                password=config.smtp_password,
                use_tls=use_tls,
                use_ssl=use_ssl,
                timeout=10,
            )
            email_message = EmailMessage(
                subject=subject,
                body=body,
                from_email=from_email,
                to=[email],
                connection=connection,
            )
            # Siųsti su istorijos įrašymu
            result = send_email_message_with_logging(
                email_message=email_message,
                email_type='custom',
                sent_by=request.user if hasattr(request, 'user') and request.user.is_authenticated else None,
                metadata={'recipient_name': '', 'test_email': True}
            )
            
            if not result.get('success'):
                raise Exception(result.get('error', 'Nežinoma klaida'))
        except (SMTPException, OSError, socket.error) as exc:
            logger.exception('Nepavyko išsiųsti testinio el. laiško: %s', exc)
            return Response(
                {'error': f'Nepavyko išsiųsti testinio laiško: {str(exc)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response({'message': f'Testinis laiškas sėkmingai išsiųstas adresu {email}.'}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='test-imap')
    def test_imap_connection(self, request):
        """Patikrina ar galima prisijungti prie IMAP serverio su pateiktais arba išsaugotais duomenimis."""
        data = request.data or {}
        config = NotificationSettings.load()

        def _get(key, default=None):
            if key in data and data[key] not in [None, '']:
                return data[key]
            return getattr(config, key, default)

        imap_enabled = str(_get('imap_enabled', False)).lower() in ['1', 'true', 'yes']
        if not imap_enabled:
            return Response({'error': 'IMAP sinchronizacija nėra įjungta.'}, status=status.HTTP_400_BAD_REQUEST)

        host = _get('imap_host', '').strip()
        port = int(_get('imap_port', 993) or 993)
        use_ssl = str(_get('imap_use_ssl', True)).lower() in ['1', 'true', 'yes']
        use_starttls = str(_get('imap_use_starttls', False)).lower() in ['1', 'true', 'yes']
        username = _get('imap_username', '').strip()
        password = data.get('imap_password') if 'imap_password' in data else getattr(config, 'imap_password', '')
        folder = _get('imap_folder', 'INBOX').strip() or 'INBOX'

        missing = []
        if not host:
            missing.append('IMAP serveris')
        if not port:
            missing.append('IMAP portas')
        if not username:
            missing.append('IMAP naudotojas')
        if not password:
            missing.append('IMAP slaptažodis')

        if missing:
            return Response({'error': 'Nepakanka IMAP duomenų: ' + ', '.join(missing)}, status=status.HTTP_400_BAD_REQUEST)

        client = None
        try:
            if use_ssl:
                client = imaplib.IMAP4_SSL(host, port)
            else:
                client = imaplib.IMAP4(host, port)
                if use_starttls:
                    client.starttls()

            client.login(username, password)
            status_list, mailboxes = client.list()
            if status_list != 'OK':
                logger.warning('Nepavyko gauti IMAP aplankų sąrašo: %s', status_list)

            status_select, _ = client.select(folder, readonly=True)
            if status_select != 'OK':
                raise imaplib.IMAP4.error(f"Aplankas „{folder}“ nerastas arba neprieinamas.")

            message_count = client.search(None, 'ALL')[1][0].split()
            total_msgs = len(message_count)

            client.logout()
        except imaplib.IMAP4.error as exc:
            if client is not None:
                try:
                    client.logout()
                except Exception:
                    pass
            logger.exception('Nepavyko prisijungti prie IMAP serverio: %s', exc)
            return Response({'error': f'Nepavyko prisijungti prie IMAP: {str(exc)}'}, status=status.HTTP_400_BAD_REQUEST)
        except (OSError, socket.error) as exc:
            if client is not None:
                try:
                    client.logout()
                except Exception:
                    pass
            logger.exception('IMAP ryšio klaida: %s', exc)
            return Response({'error': f'IMAP ryšio klaida: {str(exc)}'}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'message': f'Sėkmingai prisijungta prie IMAP. Aplanke „{folder}“ yra {total_msgs} laiškų.'
        }, status=status.HTTP_200_OK)


class UISettingsViewSet(viewsets.ModelViewSet):
    """UI nustatymų CRUD operacijos"""
    queryset = UISettings.objects.all()
    serializer_class = UISettingsSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        # Visada grąžiname vienintelį įrašą
        UISettings.load()
        return UISettings.objects.filter(pk=1)
    
    def get_object(self):
        """Grąžina vienintelį įrašą"""
        UISettings.load()
        return UISettings.objects.get(pk=1)

    @action(detail=False, methods=['get', 'put'])
    def current(self, request):
        """Grąžina arba atnaujina esamus UI nustatymus"""
        ui_settings = UISettings.load()
        
        if request.method == 'GET':
            serializer = self.get_serializer(ui_settings)
            return Response(serializer.data)
        
        elif request.method == 'PUT':
            serializer = self.get_serializer(ui_settings, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                updated_settings = UISettings.objects.get(pk=1)
                return Response(self.get_serializer(updated_settings).data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class EmailTemplateViewSet(viewsets.ModelViewSet):
    """El. laiškų šablonų CRUD operacijos"""
    queryset = EmailTemplate.objects.all()
    serializer_class = EmailTemplateSerializer
    permission_classes = [IsAuthenticated]
    ordering = ['template_type']
    
    @action(detail=True, methods=['post'], url_path='test')
    def test_template(self, request, pk=None):
        """Išsiunčia testinį el. laišką su pasirinktu šablonu"""
        template = self.get_object()
        email = request.data.get('email', '').strip()
        
        if not email:
            return Response({'error': 'Prašome įvesti el. pašto adresą.'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            validate_email(email)
        except ValidationError:
            return Response({'error': 'El. pašto adresas neteisingas.'}, status=status.HTTP_400_BAD_REQUEST)
        
        config = NotificationSettings.load()
        
        if not config.smtp_enabled:
            return Response({'error': 'SMTP siuntimas nėra įjungtas. Įjunkite „Įjungti el. laiškų siuntimą" ir išsaugokite nustatymus.'},
                            status=status.HTTP_400_BAD_REQUEST)
        
        missing_fields = []
        if not config.smtp_host:
            missing_fields.append('SMTP serveris')
        if not config.smtp_port:
            missing_fields.append('SMTP portas')
        if not config.smtp_username:
            missing_fields.append('SMTP naudotojas')
        if not config.smtp_password:
            missing_fields.append('SMTP slaptažodis')
        if not config.smtp_from_email:
            missing_fields.append('Numatytasis siuntėjas (el. paštas)')
        
        if missing_fields:
            return Response(
                {'error': 'Nepakanka SMTP nustatymų. Trūksta laukų: ' + ', '.join(missing_fields)},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Paruošti testinius duomenis šablonui (visi kintamieji, kad bet kuris šablonas nerūtų)
        test_context = {
            'invoice_number': 'TEST-001',
            'partner_name': 'Testinis Klientas',
            'amount': '100,00 EUR',
            'amount_net': '100,00 EUR',
            'amount_total': '121,00 EUR',
            'vat_rate': '21',
            'issue_date': '2025-11-20',
            'due_date': '2025-12-20',
            'overdue_days': '0',
            'payment_status': 'Neapmokėta',
            'order_number': '2026-001',
            'client_order_number': 'KLT-2026-001',
            'order_date': '2026-01-15',
            'route_from': 'Vilnius, Lietuva',
            'route_to': 'Ryga, Latvija',
            'loading_date': '2026-01-20',
            'unloading_date': '2026-01-22',
            'manager_name': 'Testinis Vadybininkas',
            'other_unpaid_invoices': '',
            'partner_code': '123456',
            'partner_vat_code': 'LT123456789',
            'price_net': '500,00 EUR',
            'price_with_vat': '605,00 EUR',
            'expedition_number': 'EXP-001',
        }
        
        from .email_utils import render_email_template
        
        try:
            # Renderinti šabloną su testiniais duomenimis (taip pat kaip send_debtor_reminder_email)
            email_content = render_email_template(
                template_type=template.template_type,
                context=test_context,
                is_auto_generated=False
            )
            
            # Formuoti from_email su vardu (taip pat kaip send_debtor_reminder_email)
            from_email = f"{config.smtp_from_name or 'TMS Sistema'} <{config.smtp_from_email}>"
            
            use_tls = bool(config.smtp_use_tls)
            use_ssl = False
            if not use_tls and config.smtp_port in (465, 587):
                use_ssl = config.smtp_port == 465
            
            connection = get_connection(
                backend='django.core.mail.backends.smtp.EmailBackend',
                host=config.smtp_host,
                port=config.smtp_port,
                username=config.smtp_username,
                password=config.smtp_password,
                use_tls=use_tls,
                use_ssl=use_ssl,
                timeout=10,
            )
            
            # Naudoti body_text (taip pat kaip send_debtor_reminder_email)
            email_msg = EmailMessage(
                subject=f"[TEST] {email_content['subject']}",
                body=email_content['body_text'],
                from_email=from_email,
                to=[email],
                connection=connection,
            )
            
            # Jei yra HTML, naudoti HTML (taip pat kaip kiti laiškai)
            if email_content.get('body_html'):
                email_msg.content_subtype = 'html'
                email_msg.body = email_content['body_html']
            
            result = send_email_message_with_logging(
                email_message=email_msg,
                email_type='test_template',
                sent_by=request.user if hasattr(request, 'user') and request.user.is_authenticated else None,
                metadata={'recipient_name': 'Testinis Klientas', 'test_template': True, 'template_type': template.template_type}
            )
            
            if not result.get('success'):
                error_msg = result.get('error', 'Nežinoma klaida')
                logger.error(f"Klaida siunčiant testinį el. laišką su šablonu {template.template_type}: {error_msg}")
                raise Exception(error_msg)
                
        except Exception as e:
            error_str = str(e)
            logger.error(f"Klaida siunčiant testinį el. laišką su šablonu {template.template_type}: {error_str}", exc_info=True)
            
            # Sudaryti aiškesnę klaidos žinutę
            if 'Invalid address' in error_str:
                return Response(
                    {'error': f'Netinkamas el. pašto adresas: {email}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            elif 'SMTP' in error_str or 'connection' in error_str.lower() or 'timeout' in error_str.lower():
                return Response(
                    {'error': f'SMTP ryšio klaida: {error_str}. Patikrinkite SMTP nustatymus.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            elif 'authentication' in error_str.lower() or 'credentials' in error_str.lower() or '535' in error_str:
                return Response(
                    {'error': f'SMTP autentifikacijos klaida: {error_str}. Patikrinkite SMTP naudotojo vardą ir slaptažodį.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            else:
                return Response(
                    {'error': f'Klaida siunčiant testinį el. laišką: {error_str}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        return Response({'message': f'Testinis el. laiškas su šablonu "{template.get_template_type_display()}" sėkmingai išsiųstas į {email}.'}, status=status.HTTP_200_OK)