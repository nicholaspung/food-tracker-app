#!/bin/bash
# Monitoring & Alerting Setup Script

set -euo pipefail

echo "🔔 Setting up monitoring and alerting..."

# 1. Create healthchecks.io account and get UUID
echo ""
echo "1. Sign up for healthchecks.io (free):"
echo "   https://healthchecks.io/signup/"
echo ""
read -p "Enter your healthchecks.io ping URL (e.g., https://hc-ping.com/YOUR-UUID): " HEALTHCHECK_URL

# Update backup script with healthcheck URL
if [ -n "$HEALTHCHECK_URL" ]; then
    sed -i "s|HEALTHCHECK_URL=\"\"|HEALTHCHECK_URL=\"$HEALTHCHECK_URL\"|" /opt/food-tracker-app/scripts/backup-pocketbase.sh
    echo "✅ Healthcheck URL configured in backup script"
fi

# 2. Optional: Email notifications
echo ""
echo "2. (Optional) Setup email notifications:"
echo "   Configure email alerts in backup-pocketbase.sh by setting ALERT_EMAIL variable"
echo ""
read -p "Enter email for alerts (or press Enter to skip): " ALERT_EMAIL

if [ -n "$ALERT_EMAIL" ]; then
    # Update backup script with alert email
    sed -i "s|ALERT_EMAIL=\"\"|ALERT_EMAIL=\"$ALERT_EMAIL\"|" /opt/food-tracker-app/scripts/backup-pocketbase.sh
    echo "✅ Email notifications configured for backups"
    echo "Note: Ensure 'mail' command is available (apt install mailutils)"
fi

# 3. Setup Uptime Robot
echo ""
echo "3. Setup uptime monitoring:"
echo "   - Go to https://uptimerobot.com/ (free)"
echo "   - Add HTTP(s) monitor for: https://yummyrecs.com"
echo "   - Add HTTP(s) monitor for: https://yummyrecs.com/api/health"
echo "   - Set check interval: 5 minutes"
echo ""
read -p "Press Enter when done..."

# 4. Test healthcheck
if [ -n "$HEALTHCHECK_URL" ]; then
    echo ""
    echo "Testing healthcheck integration..."
    curl -fsS "$HEALTHCHECK_URL" && echo "✅ Healthcheck test successful"
fi

echo ""
echo "✅ Monitoring setup complete!"
echo ""
echo "Next: Update backup cron job to use healthcheck:"
echo "  crontab -e"
echo "  0 2 * * * HEALTHCHECK_URL=$HEALTHCHECK_URL /opt/food-tracker-app/scripts/backup-pocketbase.sh >> /var/log/pocketbase-backup.log 2>&1"
