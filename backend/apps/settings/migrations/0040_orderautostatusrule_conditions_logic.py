# Generated manually: OrderAutoStatusRule – conditions + logic_operator
# Veikia ir serveryje (seni condition_type/condition_params), ir lokaliai (jau yra conditions).

from django.db import migrations, models


def get_table_columns(connection, table_name):
    """Grąžina stulpelių pavadinimus lentelėje (MySQL/MariaDB)."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s",
            [table_name],
        )
        return [row[0] for row in cursor.fetchall()]


def forward(apps, schema_editor):
    connection = schema_editor.connection
    table = "settings_orderautostatusrule"
    columns = get_table_columns(connection, table)

    if "conditions" not in columns:
        schema_editor.execute(
            f"ALTER TABLE {connection.ops.quote_name(table)} "
            "ADD COLUMN conditions JSON DEFAULT ('[]'), "
            "ADD COLUMN logic_operator VARCHAR(10) DEFAULT 'AND'"
        )

    if "condition_type" in columns:
        # Perkelti duomenis: condition_type + condition_params -> conditions
        schema_editor.execute(
            f"UPDATE {connection.ops.quote_name(table)} SET "
            "conditions = JSON_ARRAY(JSON_OBJECT('type', condition_type, 'params', COALESCE(condition_params, '{}'))), "
            "logic_operator = 'AND' "
            "WHERE condition_type IS NOT NULL"
        )
        schema_editor.execute(
            f"ALTER TABLE {connection.ops.quote_name(table)} "
            "DROP COLUMN condition_type, DROP COLUMN condition_params"
        )


def reverse(apps, schema_editor):
    connection = schema_editor.connection
    table = "settings_orderautostatusrule"
    columns = get_table_columns(connection, table)

    if "condition_type" not in columns:
        schema_editor.execute(
            f"ALTER TABLE {connection.ops.quote_name(table)} "
            "ADD COLUMN condition_type VARCHAR(50) NULL, "
            "ADD COLUMN condition_params JSON NULL"
        )
    # Atgal perkelti: pirmą sąlygą iš conditions -> condition_type, condition_params
    schema_editor.execute(
        f"UPDATE {connection.ops.quote_name(table)} SET "
        "condition_type = JSON_UNQUOTE(JSON_EXTRACT(JSON_EXTRACT(conditions, '$[0]'), '$.type')), "
        "condition_params = COALESCE(JSON_EXTRACT(conditions, '$[0].params'), '{}') "
        "WHERE JSON_LENGTH(conditions) > 0"
    )
    if "conditions" in columns:
        schema_editor.execute(
            f"ALTER TABLE {connection.ops.quote_name(table)} "
            "DROP COLUMN conditions, DROP COLUMN logic_operator"
        )


class Migration(migrations.Migration):

    dependencies = [
        ("settings", "0039_orderautostatussettings_created_updated"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name="orderautostatusrule",
                    name="conditions",
                    field=models.JSONField(
                        blank=True,
                        default=list,
                        help_text='Sąrašas sąlygų: [{"type": "...", "params": {...}}, ...]',
                        verbose_name="Sąlygos",
                    ),
                ),
                migrations.AddField(
                    model_name="orderautostatusrule",
                    name="logic_operator",
                    field=models.CharField(
                        choices=[
                            ("AND", "Visi (AND)"),
                            ("OR", "Bet kuris (OR)"),
                        ],
                        default="AND",
                        help_text="Kaip kombinuoti sąlygas: AND (visos) arba OR (bent viena)",
                        max_length=10,
                        verbose_name="Logika",
                    ),
                ),
                migrations.RemoveField(
                    model_name="orderautostatusrule",
                    name="condition_type",
                ),
                migrations.RemoveField(
                    model_name="orderautostatusrule",
                    name="condition_params",
                ),
            ],
            database_operations=[
                migrations.RunPython(forward, reverse),
            ],
        ),
    ]
