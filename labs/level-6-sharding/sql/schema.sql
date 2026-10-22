-- Identical on every shard. A shard holds only the rows the router assigns to it.
CREATE TABLE users (
    id      bigint  PRIMARY KEY,      -- the shard key
    name    text    NOT NULL,
    points  integer NOT NULL
);
CREATE INDEX users_points_idx ON users (points DESC);

-- Counters for the hot-key experiment (step 6)
CREATE TABLE counters (
    key  text   PRIMARY KEY,
    n    bigint NOT NULL
);

-- ID generation (step 7): a local auto-increment next to a Snowflake ID made by the worker
CREATE TABLE id_test (
    local_id   bigserial PRIMARY KEY,
    snowflake  bigint NOT NULL
);
