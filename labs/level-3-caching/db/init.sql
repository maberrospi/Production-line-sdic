-- 10,000 products. Runs once, when the database volume is first created.
CREATE TABLE products (
    id           integer PRIMARY KEY,
    name         text    NOT NULL,
    price_cents  integer NOT NULL,
    description  text    NOT NULL
);
INSERT INTO products
SELECT g, 'product-' || g, 100 + (g * 37) % 9900, repeat('Lorem ipsum dolor sit amet. ', 4)
FROM generate_series(1, 10000) AS g;
