from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db import connection


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def expedition_list(request):
    """Grąžina ekspedicijų sąrašą (order_carriers su expedition_number)"""
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT
                    oc.id,
                    oc.expedition_number,
                    oc.created_at,
                    p.name as carrier_name,
                    CONCAT(oc.route_from_country, ' - ', oc.route_to_country) as route,
                    oc.loading_date,
                    oc.unloading_date,
                    oc.status,
                    oc.payment_status,
                    CASE WHEN oc.invoice_issued = 1 THEN 'Išrašyta' ELSE 'Neišrašyta' END as invoice_status
                FROM order_carriers oc
                LEFT JOIN partners p ON oc.partner_id = p.id
                WHERE oc.expedition_number IS NOT NULL AND oc.expedition_number != ''
                ORDER BY oc.created_at DESC
            """)

            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]

            return Response({
                "count": len(results),
                "next": None,
                "previous": None,
                "results": results
            })
    except Exception as e:
        return Response({"error": str(e)}, status=500)
