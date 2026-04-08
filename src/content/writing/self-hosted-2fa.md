---
title: "Why I Self-Hosted Our Office's 2FA Codes"
date: "March 2026"
readTime: "5 min"
tags: ["PHP", "Docker", "Security"]
---

## The problem with shared 2FA

The office had a dozen services protected by TOTP two-factor authentication. The codes lived under one shared Google account, synced to Google Authenticator on everyone's phone. When someone left the company, you had to make sure they removed the account from their device. When someone accidentally deleted the app or the account, codes were gone. New hires needed the shared Google credentials to set up Authenticator on their phone, which meant passing around login info for a security-critical account.

It worked until it didn't. The shared account model made onboarding slow, offboarding risky, and accidental deletion a constant threat. There was no access control (everyone saw every code), no audit trail, and no way to recover if someone wiped their phone.

## Why not a SaaS

1Password, Authy, and similar services solve this problem. They also mean handing your TOTP secrets to a third party. For an office that handles sensitive client data, that's a conversation with compliance that nobody wants to have. The secrets stay on our network.

## The build

I forked [token2/TOTPVault](https://github.com/token2/TOTPVault), an open-source TOTP manager, and rebuilt most of it. The original had the basics (store secrets, show codes) but was missing everything needed for a team environment.

What I added:

- **Password authentication.** The original had no auth. Now it's email + password with bcrypt hashing and login rate limiting (5 failed attempts = 15-minute lockout).
- **Admin roles and approval flow.** Admins invite users via email. New accounts require admin approval before activation. No self-registration.
- **Teams.** Codes are assigned to teams (Production, IT, Sales, etc.). Users see only the codes shared with their team. Admins see everything.
- **AES-256-GCM encryption at rest.** TOTP secrets are encrypted in the database. The encryption key lives in the server config, not in the database. Compromising the database alone doesn't expose the secrets.
- **Activity logging.** Every code view is logged with who, what, and when. Audit trail for compliance.
- **Google Authenticator import.** Export your QR codes from Google Authenticator, drop the screenshot into the import page, and the tool reads the QR codes and bulk-imports the secrets. This made the migration from "one person's phone" to the vault a 5-minute process.
- **SMTP email.** Invite links, password resets, and approval notifications all go through the office mail server.

## Deployment on a QNAP NAS

The whole thing runs in two Docker containers on the office NAS: one for the PHP app (Apache), one for MariaDB. No cloud, no external dependencies.

The QNAP NAS has some quirks. The Docker socket is at `/var/run/system-docker.sock` instead of the default path. The kernel can't build Docker images, so images have to be built on a development machine and loaded onto the NAS via `docker save` and `docker load`. Not elegant, but it works and the deployment is a known quantity.

```python
# Build on dev machine, deploy to NAS
docker build --platform linux/arm64 -t totpvault-app .
docker save totpvault-app -o totpvault-app.tar
scp totpvault-app.tar admin@NAS_IP:/share/totpvault-app.tar

# On the NAS
docker load < totpvault-app.tar
docker compose down && docker compose up -d
```

## The security model

The threat model is simple: the secrets must not leave the network, and access must be auditable.

- Secrets are AES-256-GCM encrypted in MariaDB. The key is in a config file on the NAS filesystem, not in the database.
- Passwords are bcrypt. Sessions are HttpOnly, SameSite=Lax.
- CSRF tokens on every form. Rate limiting on login.
- Users can't self-register. Admin sends an invite, user sets a password, admin approves the account. Three-step process, no shortcuts.
- Every code view is logged. If someone accessed a code they shouldn't have, the activity log shows it.

## What it replaced

A shared Google account with Google Authenticator synced to every phone in the office. No access control, no audit trail, no protection against accidental deletion, and a shared credential that had to be revoked every time someone left.

Now there's a web dashboard that the team accesses from their desk, with team-scoped visibility, encrypted storage, and a paper trail. Onboarding is an email invite. Offboarding is disabling the account. The dashboard shows the current code and the next upcoming code, so nobody's scrambling to type it in before it rotates.

It's not a complex system. It's PHP, MySQL, and Docker on a NAS. But it solved a real problem that was costing the office time every week, and it did it without sending secrets to anyone else's servers.
