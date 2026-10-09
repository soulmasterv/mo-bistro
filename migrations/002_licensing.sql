CREATE TABLE IF NOT EXISTS restaurant_license (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended')),
    plan TEXT NOT NULL DEFAULT 'monthly',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS license_audit_log (
    id BIGSERIAL PRIMARY KEY,
    action TEXT NOT NULL
        CHECK (action IN ('activate', 'renew', 'suspend')),
    previous_status TEXT,
    new_status TEXT NOT NULL,
    previous_expiry TIMESTAMPTZ,
    new_expiry TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
