-- Fix missing inventory rows for product variants
-- These variants have available=true but no inventory rows, causing "Rupture de stock"
-- This backfills inventory with the original demo stock quantities

-- Insert inventory rows for variants that don't have them
-- Using known demo stock quantities: 25,18,12,30,15,10,20,6
-- Ordered by product creation (oldest first) to match the original seed

WITH ranked_variants AS (
  SELECT 
    pv.id as variant_id,
    ROW_NUMBER() OVER (ORDER BY p.created_at ASC, pv.id ASC) as rn
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  LEFT JOIN inventory i ON i.variant_id = pv.id
  WHERE pv.status = 'active'
    AND p.status = 'active'
    AND i.variant_id IS NULL
),
stock_values AS (
  SELECT * FROM (VALUES 
    (1, 25), (2, 18), (3, 12), (4, 30),
    (5, 15), (6, 10), (7, 20), (8, 6)
  ) AS t(rn, qty)
)
INSERT INTO inventory (variant_id, quantity, reserved_quantity)
SELECT 
  rv.variant_id,
  COALESCE(sv.qty, 10) as quantity,
  0 as reserved_quantity
FROM ranked_variants rv
LEFT JOIN stock_values sv ON sv.rn = rv.rn
ON CONFLICT (variant_id) DO NOTHING;
