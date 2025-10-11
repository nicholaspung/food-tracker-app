#!/bin/bash
# Remote Backup Storage Setup

set -euo pipefail

echo "☁️  Setting up remote backup storage..."
echo ""
echo "Choose your remote storage provider:"
echo "1. Backblaze B2 (Cheapest - $0.005/GB)"
echo "2. AWS S3 (Most popular)"
echo "3. Rsync to remote server (DIY)"
echo ""
read -p "Enter choice (1-3): " CHOICE

case $CHOICE in
    1)
        # Backblaze B2 setup
        echo ""
        echo "📦 Backblaze B2 Setup:"
        echo "1. Sign up: https://www.backblaze.com/b2/sign-up.html"
        echo "2. Create a bucket: mobile-tracker-backups"
        echo "3. Create application key with read/write access"
        echo ""
        read -p "Enter your application key ID: " B2_KEY_ID
        read -p "Enter your application key: " B2_KEY

        # Install B2 CLI
        sudo apt-get install -y python3-pip
        pip3 install b2

        # Configure B2
        b2 authorize-account "$B2_KEY_ID" "$B2_KEY"

        # Update backup script
        sed -i '/# Example: Upload to AWS S3/,/# fi/c\
    # Upload to Backblaze B2\
    if command -v b2 \&> /dev/null; then\
        log "Uploading to Backblaze B2..."\
        if b2 upload-file mobile-tracker-backups "$BACKUP_FILE" \\\
            "pocketbase/pb-$TIMESTAMP.tar.gz"; then\
            log "B2 upload successful"\
        else\
            error_exit "B2 upload failed"\
        fi\
    fi' /opt/mobile-tracker-app/scripts/backup-pocketbase.sh

        echo "✅ Backblaze B2 configured!"
        ;;

    2)
        # AWS S3 setup
        echo ""
        echo "📦 AWS S3 Setup:"
        echo "1. Create S3 bucket: mobile-tracker-backups"
        echo "2. Create IAM user with S3 permissions"
        echo "3. Get access key and secret"
        echo ""
        read -p "Enter AWS access key ID: " AWS_KEY
        read -p "Enter AWS secret access key: " AWS_SECRET
        read -p "Enter AWS region (e.g., us-east-1): " AWS_REGION
        read -p "Enter S3 bucket name: " S3_BUCKET

        # Install AWS CLI
        sudo apt-get install -y awscli

        # Configure AWS
        mkdir -p ~/.aws
        cat > ~/.aws/credentials <<EOF
[default]
aws_access_key_id = $AWS_KEY
aws_secret_access_key = $AWS_SECRET
EOF

        cat > ~/.aws/config <<EOF
[default]
region = $AWS_REGION
output = json
EOF

        # Update backup script
        sed -i "s|# if command -v aws|if command -v aws|" /opt/mobile-tracker-app/scripts/backup-pocketbase.sh
        sed -i "s|#     log \"Uploading to S3...\"|    log \"Uploading to S3...\"|" /opt/mobile-tracker-app/scripts/backup-pocketbase.sh
        sed -i "s|#     if aws s3 cp|    if aws s3 cp|" /opt/mobile-tracker-app/scripts/backup-pocketbase.sh
        sed -i "s|# fi|fi|" /opt/mobile-tracker-app/scripts/backup-pocketbase.sh
        sed -i "s|s3://your-bucket/mobile-tracker-app/|s3://$S3_BUCKET/mobile-tracker-app/|" /opt/mobile-tracker-app/scripts/backup-pocketbase.sh

        echo "✅ AWS S3 configured!"
        ;;

    3)
        # Rsync setup
        echo ""
        echo "📦 Rsync Setup:"
        echo "You need a remote server with SSH access"
        echo ""
        read -p "Enter remote server (user@host): " REMOTE_SERVER
        read -p "Enter remote backup path: " REMOTE_PATH

        # Setup SSH key if not exists
        if [ ! -f ~/.ssh/id_rsa ]; then
            ssh-keygen -t rsa -b 4096 -C "backup@mobile-tracker-app" -N "" -f ~/.ssh/id_rsa
            echo ""
            echo "Copy this public key to your remote server:"
            cat ~/.ssh/id_rsa.pub
            echo ""
            read -p "Press Enter when done..."
        fi

        # Update backup script
        sed -i "/# Example: Upload via rsync/,/# fi/c\
    # Upload via rsync\
    if command -v rsync \&> /dev/null; then\
        log \"Uploading to remote server...\"\
        if rsync -avz --timeout=300 \"\$BACKUP_FILE\" \\\
            $REMOTE_SERVER:$REMOTE_PATH/; then\
            log \"Rsync upload successful\"\
        else\
            error_exit \"Rsync upload failed\"\
        fi\
    fi" /opt/mobile-tracker-app/scripts/backup-pocketbase.sh

        echo "✅ Rsync configured!"
        ;;
esac

echo ""
echo "Testing backup with remote storage..."
bash /opt/mobile-tracker-app/scripts/backup-pocketbase.sh

echo ""
echo "✅ Remote backup storage setup complete!"
echo ""
echo "Verify backups exist in your remote storage"
