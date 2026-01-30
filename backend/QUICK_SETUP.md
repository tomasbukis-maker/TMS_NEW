# Greita Lokalios DB Instrukcija

## ✅ Kas jau padaryta:

1. ✅ `.env` failas atnaujintas su DB nustatymais
2. ✅ Django kodas paruoštas su sinchronizacija
3. ✅ Duomenys exportuoti iš nuotolinės DB
4. ✅ Script'as sukurtas: `/var/www/tms/backend/create_local_db.sh`

---

## 🔧 Ką reikia padaryti:

### 1. SSH į serverį:
```bash
ssh tomas@192.168.9.26
```

### 2. Sukurti lokalių DB (reikia sudo):
```bash
cd /var/www/tms/backend
sudo bash create_local_db.sh
```

**ARBA** tiesiogiai:
```bash
sudo mysql << EOF
CREATE DATABASE IF NOT EXISTS tms_db_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'tms_local'@'localhost' IDENTIFIED BY 'tms_local_pass_2025';
GRANT ALL PRIVILEGES ON tms_db_local.* TO 'tms_local'@'localhost';
FLUSH PRIVILEGES;
EOF
```

### 3. Importuoti duomenis:
```bash
cd /var/www/tms/backend
LATEST_BACKUP=$(ls -t /tmp/tms_backup_*.sql | head -1)
mysql -u tms_local -ptms_local_pass_2025 tms_db_local < "$LATEST_BACKUP"
```

### 4. Paleisti migracijas:
```bash
cd /var/www/tms/backend
source venv/bin/activate
python manage.py migrate
```

### 5. Patikrinti sinchronizaciją:
```bash
python manage.py sync_to_replica --test
```

### 6. Restart'uoti Gunicorn:
```bash
sudo systemctl restart tms-backend
```

---

## ✅ Patikrinimas:

Patikrinkite, ar viskas veikia:

```bash
cd /var/www/tms/backend
source venv/bin/activate
python manage.py shell
```

```python
from django.db import connections

# Test lokali DB
default_conn = connections['default']
default_conn.ensure_connection()
print("✓ Lokali DB: OK")

# Test nuotolinė DB
replica_conn = connections['replica']
replica_conn.ensure_connection()
print("✓ Nuotolinė DB: OK")

# Patikrinti duomenis
from apps.orders.models import Order
local_count = Order.objects.using('default').count()
replica_count = Order.objects.using('replica').count()

print(f"Lokali DB: {local_count} užsakymų")
print(f"Nuotolinė DB: {replica_count} užsakymų")
```

---

## 🎯 Kaip veikia:

- **Lokali DB (default)** - visos operacijos vyksta čia (greičiau)
- **Nuotolinė DB (replica)** - automatiškai sinchronizuojama po kiekvieno `save()` arba `delete()`

Po to, kai sukursite užsakymą arba sąskaitą, ji automatiškai bus sinchronizuota į nuotolinę DB.

---

## 🐛 Problema sprendimas:

**Jei DB sukūrimas nepavyko:**
```bash
# Patikrinkite MySQL statusą
sudo systemctl status mariadb

# Bandykite tiesiogiai su sudo
sudo mysql -e "CREATE DATABASE tms_db_local;"
```

**Jei importavimas nepavyko:**
```bash
# Patikrinkite failą
ls -lh /tmp/tms_backup_*.sql

# Bandykite importuoti vėl
mysql -u tms_local -ptms_local_pass_2025 tms_db_local < /tmp/tms_backup_*.sql
```

