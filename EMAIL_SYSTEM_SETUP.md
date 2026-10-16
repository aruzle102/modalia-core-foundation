# MODALIA — Email & Admin Invitation System Setup

## ⚠️ Security Notice

The Resend API key you provided (`re_2WVmLhRr_...`) is **NOT** stored in any code file.
It must be set as a Supabase secret (server-side only).

## Required Manual Configuration

### 1. Set Supabase Secrets

```bash
# Set the Resend API key (server-side only, never in code)
supabase secrets set RESEND_API_KEY=PASTE_YOUR_RESEND_API_KEY

# Set the sender address (use your verified domain)
supabase secrets set EMAIL_FROM=noreply@YOUR_DOMAIN
```

### 2. Verify Domain in Resend

1. Go to https://resend.com/domains
2. Add your domain (e.g., `modalia.dz`)
3. Add the DNS records (SPF, DKIM, DMARC) to your domain
4. Wait for verification
5. Update `EMAIL_FROM` to use your verified domain

### 3. Apply Database Migration

**REVIEW REQUIRED** — Do not apply without approval:

```bash
supabase db push
```

This creates:
- `email_templates` — reusable templates
- `email_logs` — delivery history
- `admin_invitations` — secure invitation tokens

### 4. Deploy Edge Function

```bash
supabase functions deploy send-email
```

### 5. Regenerate TypeScript Types

After migration:
```bash
supabase gen types typescript --project-id YOUR_PROJECT > src/integrations/supabase/types.ts
```

## Files Created

### Edge Function
- `supabase/functions/send-email/index.ts` — Secure email sender via Resend

### Database
- `supabase/migrations/20261016170000_email_invitation_system.sql` — Tables + RLS + seed templates

### Server Functions
- `src/lib/email.functions.ts` — listTemplates, getTemplate, sendEmail, listHistory
- `src/lib/admin-invitations.functions.ts` — create, list, revoke, validate, accept

### UI Routes
- `src/routes/admin/email-center.tsx` — Compose, Templates, History tabs
- `src/routes/admin/invitations.tsx` — Super-admin invitation management
- `src/routes/invite.$token.tsx` — Public invitation acceptance page

### Permissions
- Added: `email.view`, `email.manage`, `invitations.manage`
- Added to: `src/lib/admin-permissions.ts`

### Navigation
- Added Email Center to admin sidebar (`src/components/admin/AdminShell.tsx`)

### i18n
- Added `emailCenter` key to ar/fr/en

## Testing Checklist

- [ ] Send test email through Email Center
- [ ] Verify unprivileged user cannot send (403)
- [ ] Create invitation, open link, set password, login
- [ ] Verify expired invitation is rejected
- [ ] Verify revoked invitation is rejected
- [ ] Verify reused token is rejected
- [ ] Verify wrong email cannot use invitation
- [ ] Check email history shows delivery status
- [ ] Check audit logs record all actions

## Security Features

- API key in Edge Function secrets only (never in code/logs/GitHub)
- Invitation tokens: SHA-256 hashed, single-use, 7-day expiry
- Rate limit: 50 emails/hour per admin
- Header injection prevention (CR/LF stripping)
- Email validation
- RLS policies on all tables
- Audit logging (no secrets/tokens in logs)
- Permission checks on server AND client
