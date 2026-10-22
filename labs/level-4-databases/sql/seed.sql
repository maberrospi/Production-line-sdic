-- Level 4 seed: 100,000 customers, 2,000,000 orders over the last year, and two tiny tables
-- for the concurrency experiments. Safe to rerun: it drops and recreates everything.
\timing on
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
DROP TABLE IF EXISTS orders, customers, items, doctors CASCADE;
SELECT setseed(0.42);

CREATE TABLE customers (
    id          integer PRIMARY KEY,
    name        text NOT NULL,
    country     text NOT NULL
);
INSERT INTO customers
SELECT g, 'customer-' || g, (ARRAY['CY','GR','DE','FR','UK','US'])[1 + (g % 6)]
FROM generate_series(1, 100000) AS g;

-- Note: the foreign key below does NOT create an index on orders.customer_id (step 2).
CREATE TABLE orders (
    id           bigint PRIMARY KEY,
    customer_id  integer NOT NULL REFERENCES customers (id),
    status       text NOT NULL,
    total_cents  integer NOT NULL,
    created_at   timestamptz NOT NULL
);
INSERT INTO orders
SELECT g,
       1 + floor(random() * 100000)::int,
       CASE WHEN r < 0.70 THEN 'delivered'
            WHEN r < 0.90 THEN 'shipped'
            WHEN r < 0.99 THEN 'processing'
            ELSE 'cancelled' END,
       500 + floor(random() * 20000)::int,
       now() - random() * interval '365 days'
FROM (SELECT g, random() AS r FROM generate_series(1, 2000000) AS g) AS s;

-- One product with 1,000 in stock (step 6) and two doctors on call (step 7).
CREATE TABLE items (id integer PRIMARY KEY, name text NOT NULL, stock integer NOT NULL);
INSERT INTO items VALUES (1, 'widget', 1000);
CREATE TABLE doctors (name text PRIMARY KEY, on_call boolean NOT NULL);
INSERT INTO doctors VALUES ('Alice', true), ('Bob', true);

-- Refresh the planner's statistics and the visibility map.
VACUUM ANALYZE;

SELECT 'customers' AS "table", count(*) AS rows FROM customers
UNION ALL SELECT 'doctors', count(*) FROM doctors
UNION ALL SELECT 'items', count(*) FROM items
UNION ALL SELECT 'orders', count(*) FROM orders
ORDER BY 1;
