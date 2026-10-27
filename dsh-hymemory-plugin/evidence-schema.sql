CREATE TABLE IF NOT EXISTS evidence_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    namespace TEXT NOT NULL,
    app_id TEXT NOT NULL,
    scope TEXT NOT NULL CHECK(scope IN ('c2c','group')),
    peer_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user','assistant')),
    kind TEXT NOT NULL,
    state TEXT NOT NULL,
    text TEXT NOT NULL,
    raw_json TEXT NOT NULL,
    source_time TEXT,
    recorded_at TEXT NOT NULL,
    related_ids_json TEXT NOT NULL DEFAULT '[]',
    session_id TEXT,
    platform_message_id TEXT,
    eligible INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS evidence_identity_order ON evidence_events(namespace,seq);
CREATE INDEX IF NOT EXISTS evidence_platform_id ON evidence_events(namespace,platform_message_id);
CREATE TABLE IF NOT EXISTS evidence_inbox (
    event_id TEXT PRIMARY KEY REFERENCES evidence_events(id),
    namespace TEXT NOT NULL,
    status TEXT NOT NULL,
    session_id TEXT,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence_deliveries (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL REFERENCES evidence_events(id),
    state TEXT NOT NULL CHECK(state IN ('prepared','accepted','rejected','unknown')),
    at TEXT NOT NULL,
    receipt_json TEXT,
    error_class TEXT
);
CREATE TABLE IF NOT EXISTS evidence_jobs (
    id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,
    source_event_id TEXT NOT NULL REFERENCES evidence_events(id),
    start_offset INTEGER NOT NULL,
    end_offset INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','running','done','blocked','canceled')),
    attempts INTEGER NOT NULL DEFAULT 0,
    due REAL NOT NULL,
    lease_token TEXT,
    lease_until REAL,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS evidence_pending_jobs ON evidence_jobs(status,due,lease_until);
CREATE TABLE IF NOT EXISTS evidence_barriers (
    namespace TEXT PRIMARY KEY,
    through_seq INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence_artifacts (
    namespace TEXT NOT NULL,
    event_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    path TEXT NOT NULL,
    PRIMARY KEY(namespace,event_id,kind,path)
);
CREATE TABLE IF NOT EXISTS privacy_session_routes (
    namespace TEXT NOT NULL,
    version INTEGER NOT NULL,
    source_session_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    PRIMARY KEY(namespace,version,source_session_id)
);
CREATE TABLE IF NOT EXISTS context_initializations (
    namespace TEXT NOT NULL,
    session_id TEXT NOT NULL,
    privacy_version INTEGER NOT NULL,
    message_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('prepared','committed','skipped')),
    source_ids_json TEXT NOT NULL,
    content_sha256 TEXT NOT NULL,
    budget_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(namespace,session_id,privacy_version)
);
CREATE TABLE IF NOT EXISTS context_requests (
    namespace TEXT NOT NULL,
    session_id TEXT NOT NULL,
    request_sha256 TEXT NOT NULL,
    privacy_version INTEGER NOT NULL,
    input_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(namespace,session_id,request_sha256)
);
CREATE TABLE IF NOT EXISTS history_episodes (
    id TEXT PRIMARY KEY,namespace TEXT NOT NULL,actor_id TEXT NOT NULL,
    kind TEXT NOT NULL,status TEXT NOT NULL,source_ids_json TEXT NOT NULL,
    text TEXT NOT NULL,valid_from TEXT NOT NULL,valid_to TEXT,supersedes TEXT,created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS history_episode_owner ON history_episodes(namespace,created_at);
PRAGMA user_version=4;
