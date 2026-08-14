-- Treat existing naive timestamps as UTC floating wall-clocks (app writes via setUTCHours).
ALTER TABLE "calendar_events"
  ALTER COLUMN "start_time" TYPE TIMESTAMPTZ(3) USING "start_time" AT TIME ZONE 'UTC',
  ALTER COLUMN "end_time" TYPE TIMESTAMPTZ(3) USING "end_time" AT TIME ZONE 'UTC';
