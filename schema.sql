DROP TABLE IF EXISTS properties;

CREATE TABLE properties (
    pin TEXT PRIMARY KEY,
    address TEXT,
    owner TEXT,
    data TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_properties_address ON properties(address);
CREATE INDEX idx_properties_owner ON properties(owner);
