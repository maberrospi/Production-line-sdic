CREATE TABLE notes (
    id          bigserial PRIMARY KEY,
    body        text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO notes (body) VALUES
    ('Only nginx publishes ports.'),
    ('Images are tagged by commit, never latest.'),
    ('A backup you have not restored is a hope.');
