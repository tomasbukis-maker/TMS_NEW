#!/bin/bash
# Scriptas lokalių DB sukūrimui
# Paleiskite su sudo: sudo bash create_local_db.sh

echo "=== TMS Lokalios DB Sukūrimas ==="

# Sukurti DB
echo "1. Kuriama duomenų bazė..."
mysql -e "CREATE DATABASE IF NOT EXISTS tms_db_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" || {
    echo "KLAIDA: Nepavyko sukurti DB. Ar turite sudo teises?"
    exit 1
}

# Sukurti vartotoją
echo "2. Kuriamas DB vartotojas..."
mysql -e "CREATE USER IF NOT EXISTS 'tms_local'@'localhost' IDENTIFIED BY 'tms_local_pass_2025';" || {
    echo "KLAIDA: Nepavyko sukurti vartotojo."
    exit 1
}

# Suteikti teises
echo "3. Suteikiamos teisės..."
mysql -e "GRANT ALL PRIVILEGES ON tms_db_local.* TO 'tms_local'@'localhost';" || {
    echo "KLAIDA: Nepavyko suteikti teisių."
    exit 1
}

mysql -e "FLUSH PRIVILEGES;"

# Patikrinti
echo "4. Tikrinama DB..."
mysql -u tms_local -ptms_local_pass_2025 tms_db_local -e "SELECT 'Database created successfully!' AS status;" || {
    echo "KLAIDA: Nepavyko prisijungti prie DB."
    exit 1
}

echo ""
echo "✓ Lokali DB sėkmingai sukurta!"
echo ""
echo "DB: tms_db_local"
echo "User: tms_local"
echo "Password: tms_local_pass_2025"
