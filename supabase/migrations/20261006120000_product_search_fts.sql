-- Modalia product full-text search (Version 7)
-- Database-native search: tsvector + pg_trgm, replacing in-memory ilike/JS filtering.
-- Covers product name (ar/fr/en), description, SKU, brand, category (incl. ancestors), store.

-- 1. Trigram extension for typo-tolerant similarity matching.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. Search vector column (maintained by trigger; cannot be a generated column
--    because it references brand/category/store names from other tables).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 3. Vector builder: weighted multilingual tsvector for one product row.
--    Weights: A = name + sku, B = brand + category, C = store, D = description.
--    'simple' configuration is used deliberately: it tokenizes Arabic, French
--    and English without language-specific stemming that would mangle Arabic.
CREATE OR REPLACE FUNCTION public.product_search_vector(p public.products)
RETURNS tsvector
LANGUAGE plpgsql
STABLE
AS $func$
DECLARE
  v_brand text;
  v_categories text;
  v_store text;
  v_name text;
  v_desc text;
BEGIN
  -- jsonb ->> returns NULL (never an error) when the key is absent or the
  -- value is not an object, so this is safe for malformed name/description.
  v_name := coalesce(p.name->>'ar', '') || ' '
         || coalesce(p.name->>'fr', '') || ' '
         || coalesce(p.name->>'en', '');

  SELECT b.name INTO v_brand
  FROM public.brands b
  WHERE b.id = p.brand_id;

  WITH RECURSIVE chain AS (
    SELECT c.id, c.parent_id, c.name
    FROM public.categories c
    WHERE c.id = p.category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.name
    FROM public.categories c
    JOIN chain ch ON c.id = ch.parent_id
  )
  SELECT string_agg(
           coalesce(ch.name->>'ar', '') || ' '
         || coalesce(ch.name->>'fr', '') || ' '
         || coalesce(ch.name->>'en', ''),
           ' '
         )
    INTO v_categories
  FROM chain ch;

  SELECT s.name INTO v_store
  FROM public.stores s
  WHERE s.id = p.store_id;

  v_desc := coalesce(p.description->>'ar', '') || ' '
         || coalesce(p.description->>'fr', '') || ' '
         || coalesce(p.description->>'en', '') || ' '
         || coalesce(p.short_description->>'ar', '') || ' '
         || coalesce(p.short_description->>'fr', '') || ' '
         || coalesce(p.short_description->>'en', '');

  RETURN (
    setweight(to_tsvector('simple', coalesce(v_name, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(p.sku, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(v_brand, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(v_categories, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(v_store, '')), 'C')
    || setweight(to_tsvector('simple', coalesce(v_desc, '')), 'D')
  );
END;
$func$;

-- 4. Trigger: keep search_vector fresh on product writes.
CREATE OR REPLACE FUNCTION public.products_search_vector_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
BEGIN
  NEW.search_vector := public.product_search_vector(NEW);
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS products_search_vector_update ON public.products;
CREATE TRIGGER products_search_vector_update
  BEFORE INSERT OR UPDATE OF name, description, short_description, sku, brand_id, category_id, store_id
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.products_search_vector_trigger();

-- 5. Refresh product vectors when a brand/category/store name changes.
--    (Direct vector update; the products trigger is column-scoped so it will
--    not fire redundantly for this statement.)
CREATE OR REPLACE FUNCTION public.refresh_product_vectors_for_brand()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE public.products AS p
    SET search_vector = public.product_search_vector(p)
    WHERE p.brand_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS brands_refresh_product_vectors ON public.brands;
CREATE TRIGGER brands_refresh_product_vectors
  AFTER UPDATE OF name ON public.brands
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_product_vectors_for_brand();

CREATE OR REPLACE FUNCTION public.refresh_product_vectors_for_category()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    -- A category rename affects products in this category and all descendants.
    WITH RECURSIVE subtree AS (
      SELECT NEW.id AS id
      UNION
      SELECT c.id FROM public.categories c JOIN subtree s ON c.parent_id = s.id
    )
    UPDATE public.products AS p
    SET search_vector = public.product_search_vector(p)
    WHERE p.category_id IN (SELECT id FROM subtree);
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS categories_refresh_product_vectors ON public.categories;
CREATE TRIGGER categories_refresh_product_vectors
  AFTER UPDATE OF name ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_product_vectors_for_category();

CREATE OR REPLACE FUNCTION public.refresh_product_vectors_for_store()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE public.products AS p
    SET search_vector = public.product_search_vector(p)
    WHERE p.store_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS stores_refresh_product_vectors ON public.stores;
CREATE TRIGGER stores_refresh_product_vectors
  AFTER UPDATE OF name ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_product_vectors_for_store();

-- 6. Indexes.
CREATE INDEX IF NOT EXISTS products_search_vector_idx
  ON public.products USING gin (search_vector);

-- Trigram index on the concatenated multilingual name for typo tolerance.
CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON public.products USING gin ((
    coalesce(name->>'ar', '') || ' '
    || coalesce(name->>'fr', '') || ' '
    || coalesce(name->>'en', '')
  ) gin_trgm_ops);

-- 7. Backfill existing rows (idempotent).
UPDATE public.products AS p
SET search_vector = public.product_search_vector(p)
WHERE p.search_vector IS NULL;

-- 8. Production search RPC: database-native FTS with trigram fallback,
--    structured filters, visibility enforcement, and DB-level pagination.
--    SECURITY DEFINER so it can read inventory for the in-stock filter;
--    it returns only public-safe data (product ids + aggregate facet counts)
--    and enforces the public-visibility predicates itself.
CREATE OR REPLACE FUNCTION public.search_products_fts(
  p_query text,
  p_category_slug text DEFAULT NULL,
  p_brand_slugs text[] DEFAULT NULL,
  p_store_slugs text[] DEFAULT NULL,
  p_min_price numeric DEFAULT NULL,
  p_max_price numeric DEFAULT NULL,
  p_color_slugs text[] DEFAULT NULL,
  p_size_values text[] DEFAULT NULL,
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

-- Public read access: the function enforces visibility itself and returns
-- only product ids plus aggregate facet counts (no private data).
GRANT EXECUTE ON FUNCTION public.search_products_fts(
  text, text, text[], text[], numeric, numeric, text[], text[],
  boolean, boolean, text, integer, integer
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.product_search_vector(public.products) TO anon, authenticated;
