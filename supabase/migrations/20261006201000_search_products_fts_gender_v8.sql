-- MODALIA — V8 Phase-2 fix #180 (Worker A): `p_gender` for search_products_fts.
--
-- ADDITIVE ONLY. Defines a 14-argument OVERLOAD of public.search_products_fts
-- (PostgreSQL treats this as a new signature; the existing 13-argument
-- version from 20261006120000 is left untouched, so every current caller —
-- PostgREST named-notation — keeps working unchanged).
--
-- `p_gender` filters products whose category — or ANY ancestor in the category
-- chain — carries that merchandising gender (categories.gender, constrained to
-- 'men' | 'women' | 'kids' | 'unisex' by 20261006150000). Implemented as the
-- descendant-closure of gendered categories: a product qualifies iff its
-- category IS a gendered category or descends from one, which is exactly
-- "category or ancestor chain has the gender". Real DB semantics — no
-- text guessing, no invented attributes.
--
-- The NL assistant (src/lib/ai.functions.ts) passes its parsed gender here as
-- a structured param (the previous gender-words-folded-into-text behavior is
-- kept as a ranking aid only).

BEGIN;

CREATE OR REPLACE FUNCTION public.search_products_fts(
  p_query text,
  p_category_slug text DEFAULT NULL,
  p_brand_slugs text[] DEFAULT NULL,
  p_store_slugs text[] DEFAULT NULL,
  p_min_price numeric DEFAULT NULL,
  p_max_price numeric DEFAULT NULL,
  p_color_slugs text[] DEFAULT NULL,
  p_size_values text[] DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_in_stock boolean DEFAULT false,
  p_on_sale boolean DEFAULT false,
  p_sort text DEFAULT 'relevance',
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_q text := substring(regexp_replace(coalesce(p_query, ''), '[%*,()\\:''&|!"]', '', 'g'), 1, 80);
  v_tsq tsquery := plainto_tsquery('simple', v_q);
  v_has_query boolean := length(btrim(v_q)) > 0;
  v_ids uuid[];
  v_total bigint := 0;
  v_facets jsonb;
BEGIN
  -- Clamp pagination defensively.
  p_limit := greatest(1, least(coalesce(p_limit, 24), 48));
  p_offset := greatest(0, coalesce(p_offset, 0));

  WITH RECURSIVE cat_tree AS (
    SELECT c.id FROM public.categories c
    WHERE c.slug = p_category_slug AND c.status = 'active'
    UNION
    SELECT c.id FROM public.categories c
    JOIN cat_tree t ON c.parent_id = t.id
    WHERE c.status = 'active'
  ),
  -- FIX #180: gender facet. Seed = active categories carrying the requested
  -- gender; recursion = their active descendants. A product matches iff its
  -- category (or any ancestor) carries p_gender. Empty when p_gender is NULL
  -- (or matches nothing), so the base filter below is a no-op then.
  gender_cats AS (
    SELECT c.id FROM public.categories c
    WHERE p_gender IS NOT NULL
      AND c.gender = p_gender
      AND c.status = 'active'
    UNION
    SELECT c.id FROM public.categories c
    JOIN gender_cats g ON c.parent_id = g.id
    WHERE c.status = 'active'
  ),
  -- Single materialized filtered set: every later step reads from this.
  base AS MATERIALIZED (
    SELECT p.*
    FROM public.products p
    JOIN public.sellers s ON s.id = p.seller_id
    WHERE p.status = 'active'
      AND p.publication_status = 'published'
      AND p.moderation_status = 'approved'
      AND p.visibility = 'public'
      AND s.account_status = 'active'
      AND (p_category_slug IS NULL OR p.category_id IN (SELECT id FROM cat_tree))
      AND (p_brand_slugs IS NULL OR p.brand_id IN (
            SELECT id FROM public.brands WHERE slug = ANY (p_brand_slugs) AND status = 'active'))
      AND (p_store_slugs IS NULL OR p.store_id IN (
            SELECT id FROM public.stores WHERE slug = ANY (p_store_slugs) AND status = 'active'))
      AND (p_min_price IS NULL OR p.base_price >= p_min_price)
      AND (p_max_price IS NULL OR p.base_price <= p_max_price)
      AND (NOT p_on_sale OR (p.compare_at_price IS NOT NULL AND p.compare_at_price > p.base_price))
      AND (NOT p_in_stock OR EXISTS (
            SELECT 1
            FROM public.product_variants v
            JOIN public.inventory i ON i.variant_id = v.id
            WHERE v.product_id = p.id
              AND v.status = 'active'
              AND (i.quantity - coalesce(i.reserved_quantity, 0)) > 0
          ))
      AND (p_color_slugs IS NULL OR EXISTS (
            SELECT 1
            FROM public.product_variants v
            JOIN public.variant_option_values vov ON vov.variant_id = v.id
            JOIN public.product_option_values pov ON pov.id = vov.product_option_value_id
            JOIN public.colors c ON c.id = pov.color_id
            WHERE v.product_id = p.id
              AND v.status = 'active'
              AND c.slug = ANY (p_color_slugs)
              AND c.active
          ))
      AND (p_size_values IS NULL OR EXISTS (
            SELECT 1
            FROM public.product_variants v
            JOIN public.variant_option_values vov ON vov.variant_id = v.id
            JOIN public.product_option_values pov ON pov.id = vov.product_option_value_id
            LEFT JOIN public.sizes sz ON sz.id = pov.size_id AND sz.active
            WHERE v.product_id = p.id
              AND v.status = 'active'
              AND (pov.value = ANY (p_size_values) OR sz.value = ANY (p_size_values))
          ))
      AND (p_gender IS NULL OR p.category_id IN (SELECT id FROM gender_cats))
  ),
  -- Full-text matches, ranked.
  fts AS (
    SELECT b.id, ts_rank(b.search_vector, v_tsq)::real AS score
    FROM base b
    WHERE v_has_query AND b.search_vector @@ v_tsq
  ),
  -- Trigram fallback: only when FTS found fewer than 5 hits (typo tolerance).
  trg AS (
    SELECT b.id,
           similarity(
             coalesce(b.name->>'ar', '') || ' '
             || coalesce(b.name->>'fr', '') || ' '
             || coalesce(b.name->>'en', ''),
             v_q
           )::real AS score
    FROM base b
    WHERE v_has_query
      AND (SELECT count(*) FROM fts) < 5
      AND NOT EXISTS (SELECT 1 FROM fts f WHERE f.id = b.id)
      AND similarity(
            coalesce(b.name->>'ar', '') || ' '
            || coalesce(b.name->>'fr', '') || ' '
            || coalesce(b.name->>'en', ''),
            v_q
          ) > 0.25
  ),
  ranked AS (
    SELECT b.id, 0::real AS score, 0 AS src FROM base b WHERE NOT v_has_query
    UNION ALL
    SELECT id, score, 1 AS src FROM fts
    UNION ALL
    SELECT id, score, 2 AS src FROM trg
  ),
  ordered AS (
    SELECT r.id, r.score, r.src, p.base_price,
           coalesce(p.published_at, p.created_at) AS pub_at
    FROM ranked r
    JOIN public.products p ON p.id = r.id
  ),
  paged AS (
    SELECT o.id
    FROM ordered o
    ORDER BY
      CASE WHEN p_sort = 'price_asc' THEN o.base_price END ASC NULLS LAST,
      CASE WHEN p_sort = 'price_desc' THEN o.base_price END DESC NULLS LAST,
      CASE WHEN p_sort = 'newest' THEN o.pub_at END DESC NULLS LAST,
      CASE WHEN p_sort NOT IN ('price_asc', 'price_desc', 'newest') THEN o.src END ASC,
      CASE WHEN p_sort NOT IN ('price_asc', 'price_desc', 'newest') THEN o.score END DESC,
      o.id ASC
    LIMIT p_limit OFFSET p_offset
  ),
  brand_facets AS (
    SELECT b.id, b.slug, b.name, count(*) AS cnt
    FROM base p
    JOIN public.brands b ON b.id = p.brand_id
    GROUP BY b.id, b.slug, b.name
  ),
  store_facets AS (
    SELECT s.id, s.slug, s.name, s.verification_status, count(*) AS cnt
    FROM base p
    JOIN public.stores s ON s.id = p.store_id
    GROUP BY s.id, s.slug, s.name, s.verification_status
  ),
  color_facets AS (
    SELECT c.id, c.slug, c.name, c.hex_value, count(DISTINCT p.id) AS cnt
    FROM base p
    JOIN public.product_variants v ON v.product_id = p.id AND v.status = 'active'
    JOIN public.variant_option_values vov ON vov.variant_id = v.id
    JOIN public.product_option_values pov ON pov.id = vov.product_option_value_id
    JOIN public.colors c ON c.id = pov.color_id AND c.active
    GROUP BY c.id, c.slug, c.name, c.hex_value
  ),
  size_facets AS (
    SELECT sz.id, sz.value, sz.label, count(DISTINCT p.id) AS cnt
    FROM base p
    JOIN public.product_variants v ON v.product_id = p.id AND v.status = 'active'
    JOIN public.variant_option_values vov ON vov.variant_id = v.id
    JOIN public.product_option_values pov ON pov.id = vov.product_option_value_id
    JOIN public.sizes sz ON sz.id = pov.size_id AND sz.active
    GROUP BY sz.id, sz.value, sz.label
  ),
  price_bounds AS (
    SELECT min(base_price) AS mn, max(base_price) AS mx FROM base
  )
  SELECT coalesce(array_agg(paged.id), '{}') INTO v_ids FROM paged;

  SELECT count(*) INTO v_total FROM ranked;

  SELECT jsonb_build_object(
    'brands', coalesce(
      (SELECT jsonb_agg(
         jsonb_build_object('id', id, 'slug', slug, 'name', name, 'count', cnt)
         ORDER BY cnt DESC, slug ASC)
       FROM brand_facets),
      '[]'::jsonb),
    'stores', coalesce(
      (SELECT jsonb_agg(
         jsonb_build_object('id', id, 'slug', slug, 'name', name,
                            'verified', verification_status = 'verified', 'count', cnt)
         ORDER BY cnt DESC, slug ASC)
       FROM store_facets),
      '[]'::jsonb),
    'colors', coalesce(
      (SELECT jsonb_agg(
         jsonb_build_object('id', id, 'slug', slug, 'name', name,
                            'hex', hex_value, 'count', cnt)
         ORDER BY cnt DESC, slug ASC)
       FROM color_facets),
      '[]'::jsonb),
    'sizes', coalesce(
      (SELECT jsonb_agg(
         jsonb_build_object('id', id, 'value', value, 'label', label, 'count', cnt)
         ORDER BY cnt DESC, value ASC)
       FROM size_facets),
      '[]'::jsonb),
    'price_bounds', coalesce(
      (SELECT jsonb_build_object('min', floor(mn)::int, 'max', ceil(mx)::int)
       FROM price_bounds WHERE mn IS NOT NULL),
      jsonb_build_object('min', 0, 'max', 0))
  ) INTO v_facets;

  RETURN jsonb_build_object(
    'total', v_total,
    'ids', to_jsonb(v_ids),
    'facets', v_facets
  );
END;
$func$;

-- Public read access for the new overload (mirrors the 13-arg grant in
-- 20261006120000). The function enforces visibility itself and returns only
-- product ids plus aggregate facet counts (no private data).
GRANT EXECUTE ON FUNCTION public.search_products_fts(
  text, text, text[], text[], numeric, numeric, text[], text[],
  text, boolean, boolean, text, integer, integer
) TO anon, authenticated;

COMMIT;
