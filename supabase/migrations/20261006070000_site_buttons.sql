-- Phase 2/6: Centralized button/CTA control for the storefront.
-- Admin configures safe, predefined actions only — no arbitrary JS injection.
create table if not exists public.site_buttons (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  -- Safe predefined action types only (validated server-side).
  action_type text not null check (action_type in (
    'link_internal',   -- internal route, e.g. /shop
    'link_external',   -- https URL
    'link_category',   -- category slug
    'link_store',      -- store slug
    'link_collection', -- collection id
    'link_product'     -- product slug
  )),
  -- Destination: route path, URL, or slug/id depending on action_type.
  destination text not null,
  -- Where the button appears.
  placement text not null check (placement in (
    'hero_primary',
    'hero_secondary',
    'header',
    'footer',
    'category_cta',
    'product_cta',
    'banner_cta'
  )),
  -- Visual style.
  style text not null default 'primary' check (style in ('primary', 'secondary', 'ghost', 'link')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  -- Optional locale scoping; null = all locales.
  locale text check (locale in ('ar', 'fr', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_buttons enable row level security;

-- Admin-only write; public read of active buttons via server function (service role).
drop policy if exists site_buttons_admin_all on public.site_buttons;
create policy site_buttons_admin_all on public.site_buttons
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create index if not exists site_buttons_placement_idx on public.site_buttons (placement, sort_order)
  where is_active = true;
