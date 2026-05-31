# Notification preferences preserve opt-out when system permission is off

Food Tracker separates **System Notification Permission** from saved **Notification Preferences**: the system status is shown as a device-level status/action, not as a master app preference switch. When system notification permission is missing, denied, unavailable, or cannot be confirmed, users may still turn enabled notification categories off, but they cannot turn disabled categories on until permission is granted or confirmed. This preserves user opt-out intent for future delivery and other devices while avoiding a misleading in-app control that appears to own OS notification authorization.

