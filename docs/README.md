# Mobile Tracker App Documentation

Complete documentation for the Mobile Tracker App, organized by functionality.

## 📂 Documentation Structure

```
docs/
├── README.md                           # This file - documentation index
│
├── setup/                              # 🚀 Setup & Deployment
│   ├── INFRASTRUCTURE.md               # Architecture overview
│   ├── DEPLOYMENT.md                   # Deployment guide
│   └── ENV_GUIDE.md                    # Environment variables
│
├── features/                           # ✨ Feature Documentation
│   ├── EMAIL_SETUP.md                  # Email configuration
│   ├── INVITE_CODES.md                 # Invite code system
│   └── MOBILE_POSTHOG_RETENTION_DASHBOARD.md # Mobile analytics dashboard setup
│
├── operations/                         # 🔧 Operations & Maintenance
│   └── DISASTER_RECOVERY.md            # Emergency procedures
│
└── planning/                           # 📋 Planning & Future Work
    └── FUTURE_IMPROVEMENTS.md          # Architecture enhancements
```

---

## 📚 Documentation Index

### 🚀 Setup & Deployment (`setup/`)
1. **[INFRASTRUCTURE.md](setup/INFRASTRUCTURE.md)** - Architecture overview and technical deep-dive
   - VPS deployment architecture
   - Docker + Caddy setup
   - Data persistence explained
   - Security best practices

2. **[DEPLOYMENT.md](setup/DEPLOYMENT.md)** - Step-by-step deployment guide
   - VPS setup instructions
   - Initial deployment process
   - Future deployment workflow
   - Troubleshooting common issues

3. **[ENV_GUIDE.md](setup/ENV_GUIDE.md)** - Environment variable reference
   - What variables are needed
   - Local vs production configuration
   - When .env files are created (automatically!)

### ✨ Features (`features/`)

4. **[EMAIL_SETUP.md](features/EMAIL_SETUP.md)** - Email configuration guide
   - SMTP provider setup (Gmail, Resend, SendGrid)
   - PocketBase email configuration
   - Programmatic email sending
   - Domain email setup

5. **[INVITE_CODES.md](features/INVITE_CODES.md)** - Invite code system
   - Backend implementation with hooks
   - Frontend signup flow
   - Creating and managing invite codes
   - Testing the invite code flow

6. **[MOBILE_POSTHOG_RETENTION_DASHBOARD.md](features/MOBILE_POSTHOG_RETENTION_DASHBOARD.md)** - Mobile growth/retention dashboard schema
   - Activation funnel
   - Weekly retention and stickiness
   - Feature adoption mix
   - Friction and limit-pressure monitoring

### 🔧 Operations (`operations/`)

7. **[DISASTER_RECOVERY.md](operations/DISASTER_RECOVERY.md)** - Emergency procedures
   - Recovery scenarios (VPS lost, DB corruption, etc.)
   - Step-by-step recovery procedures
   - Recovery testing schedule
   - Emergency contact information

### 📋 Planning (`planning/`)

8. **[FUTURE_IMPROVEMENTS.md](planning/FUTURE_IMPROVEMENTS.md)** - Architecture enhancements
   - Notification system (Apprise + Ntfy.sh)
   - Centralized logging (Loki + Grafana)
   - Metrics monitoring (Prometheus)
   - Database replication
   - CDN integration

---

## 🚀 Quick Navigation

### I want to...

**Deploy to production for the first time:**
→ Read [setup/DEPLOYMENT.md](setup/DEPLOYMENT.md)

**Understand the architecture:**
→ Read [setup/INFRASTRUCTURE.md](setup/INFRASTRUCTURE.md)

**Configure environment variables:**
→ Read [setup/ENV_GUIDE.md](setup/ENV_GUIDE.md)

**Setup email sending:**
→ Read [features/EMAIL_SETUP.md](features/EMAIL_SETUP.md)

**Implement invite codes:**
→ Read [features/INVITE_CODES.md](features/INVITE_CODES.md)

**Set up mobile retention dashboards in PostHog:**
→ Read [features/MOBILE_POSTHOG_RETENTION_DASHBOARD.md](features/MOBILE_POSTHOG_RETENTION_DASHBOARD.md)

**Handle an emergency:**
→ Read [operations/DISASTER_RECOVERY.md](operations/DISASTER_RECOVERY.md)

**Plan future enhancements:**
→ Read [planning/FUTURE_IMPROVEMENTS.md](planning/FUTURE_IMPROVEMENTS.md)

---

## 📖 Reading Order

### For First-Time Setup:
1. [setup/INFRASTRUCTURE.md](setup/INFRASTRUCTURE.md) - Understand the architecture
2. [setup/DEPLOYMENT.md](setup/DEPLOYMENT.md) - Follow step-by-step deployment
3. [setup/ENV_GUIDE.md](setup/ENV_GUIDE.md) - Reference when needed

### Implementing Features:
4. [features/EMAIL_SETUP.md](features/EMAIL_SETUP.md) - Configure email sending
5. [features/INVITE_CODES.md](features/INVITE_CODES.md) - Set up invite code system
6. [features/MOBILE_POSTHOG_RETENTION_DASHBOARD.md](features/MOBILE_POSTHOG_RETENTION_DASHBOARD.md) - Configure mobile retention dashboards

### After Deployment:
7. [operations/DISASTER_RECOVERY.md](operations/DISASTER_RECOVERY.md) - Prepare for emergencies
8. [planning/FUTURE_IMPROVEMENTS.md](planning/FUTURE_IMPROVEMENTS.md) - Plan enhancements

---

## 🔧 Script Reference

All deployment scripts are in `/scripts/`:

- `setup-vps.sh` - Initial VPS setup (security, Docker, Caddy)
- `post-setup.sh` - Application deployment (automated)
- `deploy.sh` - Future deployments (zero-downtime)
- `backup-pocketbase.sh` - Database backup (zero-downtime)
- `monitoring-setup.sh` - Configure monitoring (+3 points)
- `remote-backup-setup.sh` - Configure remote backups (+2 points)

---

## 💡 Key Features

### Infrastructure
✅ **Zero-downtime deployments** (blue-green strategy)
✅ **Zero-downtime backups** (SQLite online backup)
✅ **Automatic rollback** on failure
✅ **Comprehensive error handling**
✅ **Production-grade security** (fail2ban, security headers, resource limits)
✅ **Idempotent scripts** (safe to run multiple times)
✅ **Health checks** (30 attempts over 60 seconds)
✅ **Automated backups** with verification
✅ **Deployment locks** (prevent concurrent runs)
✅ **HTTP/3 support** (QUIC protocol)

### Application Features
✅ **Invite code system** - Control user registration with invite codes
✅ **Email notifications** - Configurable SMTP email sending
✅ **User authentication** - Secure PocketBase authentication
✅ **Mobile-first design** - Optimized for mobile devices

---

## 🆘 Emergency Contacts

- **Primary Admin**: 22228236+nicholaspung@users.noreply.github.com
- **Repository**: https://github.com/nicholaspung/food-tracker-app
- **Live App**: https://trackyourfoods.com
- **Admin Panel**: https://trackyourfoods.com/_/

---

## 📝 Document Maintenance

These documents are kept up-to-date with the infrastructure code. If you make changes to the deployment process, please update the relevant documentation.

Last updated: 2025-10-06
