from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from .models import BlockedDomain, TrustedSender
from .serializers import BlockedDomainSerializer, TrustedSenderSerializer


class BlockedDomainViewSet(viewsets.ModelViewSet):
    """ViewSet užblokuotiems domenams valdyti."""

    serializer_class = BlockedDomainSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = BlockedDomain.objects.all()

    def get_queryset(self):
        """Grąžinti visus domenus."""
        return BlockedDomain.objects.all()

    def perform_create(self, serializer):
        """Sukurti domeną su dabartiniu naudotoju."""
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['post'])
    def block_sender_domain(self, request):
        """
        Užblokuoti domeną pagal siuntėjo email adresą.
        Naudojama iš mail sąrašo.
        """
        sender_email = request.data.get('sender_email')
        if not sender_email:
            return Response(
                {'error': 'Reikalingas sender_email parametras'},
                status=400
            )

        # Ištraukti domeną iš email adreso
        try:
            domain = sender_email.split('@')[1].lower()
            # Pašalinti specialius simbolius pabaigoje (dažnai atsiranda dėl email encoding)
            import re
            domain = re.sub(r'[>}\]\)\s]+$', '', domain)
        except (IndexError, AttributeError):
            return Response(
                {'error': 'Neteisingas email formato adresas'},
                status=400
            )

        # Patikrinti ar domenas jau užblokuotas
        if BlockedDomain.objects.filter(domain=domain).exists():
            return Response(
                {'message': f'Domenas {domain} jau užblokuotas'},
                status=200
            )

        # Sukurti naują užblokuotą domeną
        blocked_domain = BlockedDomain.objects.create(
            domain=domain,
            created_by=request.user
        )

        # Automatiškai ištrinti laiškus iš šio domeno
        deleted_count = blocked_domain.delete_emails_from_domain()
        print(f'Ištrinta {deleted_count} laiškų iš domeno {domain}')

        serializer = self.get_serializer(blocked_domain)
        return Response(serializer.data, status=201)

    @action(detail=False, methods=['post'])
    def cleanup_blocked_emails(self, request):
        """
        Ištrinti visus laiškus iš visų užblokuotų domenų.
        """
        blocked_domains = BlockedDomain.objects.all()
        total_deleted = 0

        for domain in blocked_domains:
            deleted_count = domain.delete_emails_from_domain()
            total_deleted += deleted_count
            if deleted_count > 0:
                print(f'Ištrinta {deleted_count} laiškų iš domeno {domain.domain}')

        return Response({
            'message': f'Ištrinta {total_deleted} laiškų iš {blocked_domains.count()} užblokuotų domenų',
            'deleted_count': total_deleted,
            'domains_count': blocked_domains.count()
        })


class TrustedSenderViewSet(viewsets.ModelViewSet):
    """ViewSet patikimiems siuntėjams valdyti."""

    serializer_class = TrustedSenderSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = TrustedSender.objects.all()

    def get_queryset(self):
        """Grąžinti visus patikimus siuntėjus."""
        return TrustedSender.objects.all()

    def perform_create(self, serializer):
        """Sukurti siuntėją su dabartiniu naudotoju ir perklasifikuoti laiškus."""
        trusted_sender = serializer.save(created_by=self.request.user)

        # Automatiškai perklasifikuoti laiškus iš šio domeno
        self._reclassify_emails_from_domain(trusted_sender.email)

    @action(detail=False, methods=['post'])
    def mark_as_trusted(self, request):
        """
        Pažymėti siuntėją kaip patikimą (ne reklama).
        Naudojama iš mail sąrašo.
        """
        sender_email = request.data.get('sender_email')
        if not sender_email:
            return Response(
                {'error': 'Reikalingas sender_email parametras'},
                status=400
            )

        # Išskirti tik email adresą iš "Name <email>" formato
        import re
        email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', sender_email)
        if email_match:
            clean_email = email_match.group(0)
        else:
            return Response(
                {'error': 'Neteisingas email formato adresas'},
                status=400
            )

        # Patikrinti ar siuntėjas jau yra patikimų sąraše
        if TrustedSender.objects.filter(email=clean_email).exists():
            return Response(
                {'message': f'Siuntėjas {clean_email} jau yra patikimų sąraše'},
                status=200
            )

        # Sukurti naują patikimą siuntėją
        trusted_sender = TrustedSender.objects.create(
            email=clean_email,
            created_by=request.user
        )

        # Automatiškai perklasifikuoti laiškus iš šio domeno
        self._reclassify_emails_from_domain(clean_email)

        serializer = self.get_serializer(trusted_sender)
        return Response(serializer.data, status=201)

    def _reclassify_emails_from_domain(self, trusted_email: str):
        """
        Perklasifikuoti visus laiškus iš domeno, kuriame yra patikimas email.
        """
        from apps.mail.services import _classify_as_promotional, extract_domain_from_email, extract_email_from_sender
        from apps.mail.models import MailMessage

        # Išskirti domeną
        domain = extract_domain_from_email(trusted_email)
        if not domain:
            return

        # Rasti visus laiškus iš šio domeno, kurie šiuo metu yra pažymėti kaip reklaminiai
        promotional_messages = MailMessage.objects.filter(is_promotional=True)

        updated_count = 0
        for message in promotional_messages:
            # Išskirti email iš sender lauko
            sender_email = extract_email_from_sender(message.sender)
            if not sender_email:
                continue

            # Patikrinti ar domenas sutampa
            message_domain = extract_domain_from_email(sender_email)
            if message_domain != domain:
                continue

            # Perklasifikuoti laišką
            should_be_promotional = _classify_as_promotional(message)
            if not should_be_promotional and message.is_promotional:
                message.is_promotional = False
                message.save(update_fields=['is_promotional'])
                updated_count += 1

        return updated_count
