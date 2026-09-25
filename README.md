# Modalia

Premium, mobile-first multi-vendor marketplace foundation for Algeria, designed to be global-ready.

## Stack

- React 19 + TanStack Start/Router/Query
- TypeScript + Tailwind CSS v4
- Supabase/PostgreSQL + RLS
- Radix/shadcn primitives
- Server-side checkout and validation

## Implemented

- Premium marketplace homepage with adaptive 2.5D motion
- Product catalog, variants and inventory
- Multi-store client cart
- Secure guest COD checkout using the existing `checkout_cart` database function
- 58 Wilaya baseline + shipping rules for home/office and 0–5kg / >5kg
- Parent orders + seller orders + order snapshots
- Seller application and seller workspace
- Seller product creation and staff invitation foundation
- Public seller stores
- Admin moderation, seller approval and homepage section controls
- Wishlist on-device persistence
- Reviews/notifications database foundations
- SEO/i18n/RTL foundations
- Analytics event capture
- Commission version history and order-time commission calculation
- One minimal test product seeded by migration

## Security

Sensitive commerce mutations are performed through server functions or protected database functions. Seller isolation is enforced with Supabase RLS. Payment proofs remain private. The client must never be trusted for final price, stock, seller ownership or order totals.

## Environment

Copy `.env.example` to your local environment and provide the Supabase values. Never commit `.env` or a service-role key.

## Development

Install dependencies with your configured package manager, then run:

```bash
npm run dev
npm run lint
npm run build
```

The production migration is:

`supabase/migrations/20260925120000_modalia_production_hardening.sql`

Commission versioning is:

`supabase/migrations/20260925121500_modalia_commission_versioning.sql`

## Important

The advanced courier/GPS tracking UI is intentionally not enabled yet. The order status/history schema remains ready for a later tracking phase.
