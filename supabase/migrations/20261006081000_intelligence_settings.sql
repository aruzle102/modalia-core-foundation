-- Phase 6/6: Modalia Intelligence control plane settings.
-- Single-row table (id = 1) holding admin-configurable behavior switches,
-- trilingual UI copy, and deterministic ranking weights. No external AI.
create table if not exists public.intelligence_settings (
  id integer primary key check (id = 1),
  support_enabled boolean not null default true,
  smart_shopping_enabled boolean not null default true,
  recommendations_enabled boolean not null default true,
  -- Trilingual UI copy stored as { ar, fr, en }.
  welcome_message jsonb not null default '{"ar": "", "fr": "", "en": ""}'::jsonb,
  suggested_questions jsonb not null default '[]'::jsonb,
  fallback_message jsonb not null default '{"ar": "", "fr": "", "en": ""}'::jsonb,
  -- Deterministic ranking weights; must sum to ~1 (validated server-side).
  ranking_weights jsonb not null default '{"sales": 0.4, "views": 0.3, "recency": 0.2, "rating": 0.1}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.intelligence_settings enable row level security;

-- Admin-only access; the storefront reads settings via admin-scoped server
-- functions (service role) so no public RLS read is needed.
drop policy if exists intelligence_settings_admin_all on public.intelligence_settings;
create policy intelligence_settings_admin_all on public.intelligence_settings
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- Seed the singleton row with sensible defaults (trilingual).
insert into public.intelligence_settings (id, welcome_message, suggested_questions, fallback_message)
values (
  1,
  '{"ar": "مرحباً بك في مساعد موداليا. كيف أقدر أساعدك؟", "fr": "Bienvenue sur l\u2019assistant Modalia. Comment puis-je vous aider ?", "en": "Welcome to the Modalia assistant. How can I help?"}'::jsonb,
  '[
    {"ar": "كيفاش نطلب؟", "fr": "Comment commander ?", "en": "How do I order?"},
    {"ar": "توصلو لوهران؟", "fr": "Livrez-vous à Oran ?", "en": "Do you deliver to Oran?"},
    {"ar": "كيفاش نتبع الطلبية تاعي؟", "fr": "Comment suivre ma commande ?", "en": "How do I track my order?"},
    {"ar": "كيفاش نولي بائع؟", "fr": "Comment devenir vendeur ?", "en": "How do I become a seller?"}
  ]'::jsonb,
  '{"ar": "ما لقيتش معلومة مؤكدة على هاذ السؤال في موداليا. جرّب البحث أو شوف صفحة المساعدة.", "fr": "Je n\u2019ai pas trouvé d\u2019information confirmée à ce sujet sur Modalia. Essayez la recherche ou la page d\u2019aide.", "en": "I couldn\u2019t find confirmed information about that on Modalia. Try search or the help page."}'::jsonb
)
on conflict (id) do nothing;
