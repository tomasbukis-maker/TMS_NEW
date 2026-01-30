#!/bin/bash
echo "=== TMS Deployment Configuration Check ==="
echo

# Check if .env file exists
if [ ! -f "/var/www/tms/backend/.env" ]; then
    echo "❌ ERROR: .env file not found!"
    echo "   Please copy .env.example to .env and configure it"
    exit 1
fi

echo "✅ .env file exists"

# Check database connection
echo "Testing database connection..."
cd /var/www/tms/backend
source venv/bin/activate

python manage.py dbshell -c "SELECT COUNT(*) FROM orders;" >/dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Database connection works"
else
    echo "❌ ERROR: Database connection failed!"
    echo "   Check your .env file database settings"
    exit 1
fi

echo
echo "🎉 Basic checks passed!"
