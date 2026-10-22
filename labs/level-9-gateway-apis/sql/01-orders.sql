-- 1,000,000 orders, one second apart, the newest with the highest id. Runs on the first start only.
CREATE TABLE orders (
    id            bigserial PRIMARY KEY,
    customer      text        NOT NULL,
    amount_cents  integer     NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO orders (customer, amount_cents, created_at)
SELECT 'customer-' || (g % 5000), 500 + (g * 37) % 20000, now() - (1000000 - g) * interval '1 second'
FROM generate_series(1, 1000000) AS g;
-- Matches ORDER BY created_at DESC, id DESC, including the tie-breaker: what keyset pagination needs.
CREATE INDEX orders_newest_idx ON orders (created_at DESC, id DESC);
VACUUM ANALYZE orders;
