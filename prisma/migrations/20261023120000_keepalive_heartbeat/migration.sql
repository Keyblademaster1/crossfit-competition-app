-- One row for the keepalive job to write to, so Supabase never sees the
-- database as unused and pauses it.
CREATE TABLE "KeepaliveHeartbeat" (
    "id" SMALLINT NOT NULL,
    "pings" BIGINT NOT NULL DEFAULT 0,
    "lastPingAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeepaliveHeartbeat_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "KeepaliveHeartbeat_one_row" CHECK ("id" = 1)
);

-- Locked to outside callers. The app connects as the table's owner, which
-- these rules do not apply to; anything coming in through Supabase's public
-- interface, were it ever switched on, can neither read nor write it.
ALTER TABLE "KeepaliveHeartbeat" ENABLE ROW LEVEL SECURITY;

INSERT INTO "KeepaliveHeartbeat" ("id") VALUES (1);
