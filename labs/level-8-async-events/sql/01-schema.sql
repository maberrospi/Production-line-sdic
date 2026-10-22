-- Part A: a job queue in an ordinary table
CREATE TABLE jobs (
    id          bigserial PRIMARY KEY,
    payload     text NOT NULL,
    status      text NOT NULL DEFAULT 'queued',     -- queued | done | dead
    attempts    integer NOT NULL DEFAULT 0,
    last_error  text,
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_queued_idx ON jobs (id) WHERE status = 'queued';
-- One row per "email sent", so duplicates can be counted
CREATE TABLE job_runs (
    id       bigserial PRIMARY KEY,
    job_id   bigint NOT NULL,
    worker   integer NOT NULL,
    ran_at   timestamptz NOT NULL DEFAULT now()
);

-- Part C: orders and the outbox
CREATE TABLE orders (
    id            uuid PRIMARY KEY,
    customer      text NOT NULL,
    amount_cents  integer NOT NULL,
    mode          text NOT NULL,
    run_id        text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);
-- Column names follow Debezium's outbox event router defaults: id, aggregatetype, aggregateid, payload
CREATE TABLE outbox (
    id             uuid PRIMARY KEY,
    aggregatetype  text NOT NULL,      -- picks the topic: outbox.event.<aggregatetype>
    aggregateid    text NOT NULL,      -- becomes the message key
    type           text NOT NULL,
    payload        jsonb NOT NULL,     -- becomes the message value
    created_at     timestamptz NOT NULL DEFAULT now()
);

-- Part D: the shipping consumer
CREATE TABLE shipments (
    id          bigserial PRIMARY KEY,
    order_id    text NOT NULL,
    shipped_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE processed_events (
    event_id      text PRIMARY KEY,
    processed_at  timestamptz NOT NULL DEFAULT now()
);
