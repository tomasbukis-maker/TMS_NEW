"""
Duomenų bazės sinchronizacijos modulis.
Rašo duomenis į abi DB: lokalią (default) ir nuotolinę (replica).
"""

from django.db import connections, transaction
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


class DatabaseSyncRouter:
    """
    Database router, kuris nukreipia rašymo operacijas į abi DB:
    - default (lokali DB)
    - replica (nuotolinė DB - sykas.serveriai.lt)
    """

    def db_for_read(self, model, **hints):
        """Skaitome iš lokalių DB (greičiau)"""
        return 'default'

    def db_for_write(self, model, **hints):
        """Rašome į lokalią DB"""
        return 'default'

    def allow_relation(self, obj1, obj2, **hints):
        """Leisti santykius tarp objektų"""
        return True

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        """Migracijos tik į default DB"""
        if db == 'replica':
            return False  # Neleisti migracijų į replica
        return True


def sync_to_replica(model_instance):
    """
    Sinchronizuoti modelio objektą į nuotolinę DB (replica).
    Naudojama po save() operacijų.
    """
    if 'replica' not in settings.DATABASES:
        logger.warning("Replica database not configured, skipping sync")
        return False

    try:
        # Užtikrinti, kad abu connection'ai yra atviri
        connections['default'].ensure_connection()
        connections['replica'].ensure_connection()
    except Exception as conn_error:
        logger.warning(f"Could not ensure database connections for sync: {conn_error}")
        return False

    try:
        # Gaukime modelio klasę
        model_class = model_instance.__class__
        
        # Raskime pirminį raktą
        pk_field = model_class._meta.pk
        pk_value = model_instance.pk
        
        if pk_value is None:
            logger.warning(f"Cannot sync {model_class.__name__}: no primary key")
            return False
        
        # Sukurkime defaults dict su visais laukais (išskyrus pk)
        defaults = {}
        for field in model_class._meta.fields:
            if field.primary_key:
                continue
            
            try:
                field_value = getattr(model_instance, field.name, None)
                
                # Apdoroti ForeignKey laukus - gauti tik ID
                if hasattr(field, 'remote_field') and field.remote_field:
                    if field_value is not None:
                        # Bandyti gauti ID, bet jei connection problema - praleisti
                        try:
                            if hasattr(field_value, 'pk'):
                                defaults[field.name + '_id'] = field_value.pk
                            else:
                                defaults[field.name + '_id'] = field_value
                        except Exception as e:
                            logger.warning(f"Could not get foreign key value for {field.name}: {e}")
                            continue
                else:
                    defaults[field.name] = field_value
            except Exception as e:
                logger.warning(f"Could not get field value for {field.name}: {e}")
                continue
        
        # Sukurkime arba atnaujinkime nuotolinių DB
        lookup = {pk_field.name: pk_value}
        
        try:
            # Užtikrinti connection prieš sync
            try:
                connections['replica'].ensure_connection()
            except Exception as conn_err:
                logger.warning(f"Cannot ensure replica connection: {conn_err}")
                try:
                    connections['replica'].close()
                    connections['replica'].ensure_connection()
                except Exception as recovery_err:
                    logger.error(f"Replica connection recovery failed: {recovery_err}")
                    return False
            
            replica_instance, created = model_class.objects.using('replica').update_or_create(
                **lookup,
                defaults=defaults
            )
        except Exception as sync_error:
            error_type = type(sync_error).__name__
            logger.error(f"Error syncing {model_class.__name__} to replica: {error_type}: {sync_error}")
            
            # Jei InterfaceError arba connection problema - bandyti recovery
            if 'InterfaceError' in error_type or 'OperationalError' in error_type:
                try:
                    connections['replica'].close()
                    connections['replica'].ensure_connection()
                    # Bandyti dar kartą
                    replica_instance, created = model_class.objects.using('replica').update_or_create(
                        **lookup,
                        defaults=defaults
                    )
                except Exception as retry_error:
                    logger.error(f"Replica sync retry failed: {retry_error}")
                    return False
            else:
                return False
        
        # Apdoroti ManyToMany laukus
        for field in model_class._meta.many_to_many:
            m2m_values = getattr(model_instance, field.name).all()
            getattr(replica_instance, field.name).set(m2m_values)
        
        logger.info(f"Synced {model_class.__name__} (pk={pk_value}) to replica - {'created' if created else 'updated'}")
        return True
        
    except Exception as e:
        logger.error(f"Error syncing to replica: {str(e)}", exc_info=True)
        return False


def bulk_sync_to_replica(model_class, queryset):
    """
    Masinė sinchronizacija į nuotolinę DB.
    """
    if 'replica' not in settings.DATABASES:
        logger.warning("Replica database not configured, skipping bulk sync")
        return 0

    try:
        sync_count = 0
        
        # Naudojame bulk_create su update_on_conflict (MySQL/MariaDB)
        instances = list(queryset.using('default').all())
        
        if not instances:
            return 0
        
        # Sukurkime arba atnaujinkime visus objektus replica DB
        pk_field = model_class._meta.pk
        for instance in instances:
            pk_value = instance.pk
            if pk_value is None:
                continue
            
            defaults = {}
            for field in model_class._meta.fields:
                if field.primary_key:
                    continue
                
                field_value = getattr(instance, field.name, None)
                
                # Apdoroti ForeignKey laukus
                if hasattr(field, 'remote_field') and field.remote_field:
                    if field_value is not None:
                        defaults[field.name + '_id'] = field_value.pk if hasattr(field_value, 'pk') else field_value
                else:
                    defaults[field.name] = field_value
            
            lookup = {pk_field.name: pk_value}
            model_class.objects.using('replica').update_or_create(
                **lookup,
                defaults=defaults
            )
            
            # Apdoroti ManyToMany laukus
            try:
                replica_instance = model_class.objects.using('replica').get(**lookup)
                for field in model_class._meta.many_to_many:
                    m2m_values = getattr(instance, field.name).all()
                    getattr(replica_instance, field.name).set(m2m_values)
            except Exception as e:
                logger.warning(f"Could not sync M2M for {model_class.__name__} (pk={pk_value}): {str(e)}")
            
            sync_count += 1
        
        logger.info(f"Bulk synced {sync_count} {model_class.__name__} instances to replica")
        return sync_count
        
    except Exception as e:
        logger.error(f"Error in bulk sync to replica: {str(e)}", exc_info=True)
        return 0

