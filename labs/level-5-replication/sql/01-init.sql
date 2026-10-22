-- Runs once, when the primary's data volume is first created.
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'replpass';
CREATE TABLE events (
    id          bigserial PRIMARY KEY,
    note        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO events (note) SELECT 'seed ' || g FROM generate_series(1, 1000) AS g;
