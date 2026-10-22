CREATE TABLE links (
    code       text PRIMARY KEY,             -- the unique index doubles as the collision check
    url        text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clicks (
    event_id text PRIMARY KEY,               -- the Redis stream ID: a replayed event is ignored
    code     text NOT NULL,
    at       timestamptz NOT NULL
);
CREATE INDEX clicks_code ON clicks (code);
