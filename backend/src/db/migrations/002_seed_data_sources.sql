CREATE UNIQUE INDEX IF NOT EXISTS data_sources_name_key
    ON data_sources (name);

INSERT INTO data_sources (name, category, is_enabled)
VALUES
    ('Open-Meteo', 'weather', TRUE),
    ('USGS', 'hazards', TRUE),
    ('NWS', 'alerts', TRUE),
    ('NOAA SWPC', 'aurora', TRUE),
    ('N2YO', 'satellites', TRUE),
    ('Launch Library 2', 'launches', TRUE)
ON CONFLICT (name) DO NOTHING;
