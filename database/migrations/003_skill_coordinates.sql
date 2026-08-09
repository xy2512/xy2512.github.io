ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS location_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_longitude DOUBLE PRECISION;

ALTER TABLE skills
  ADD CONSTRAINT skills_location_coordinate_pair CHECK (
    (location_latitude IS NULL AND location_longitude IS NULL)
    OR (location_latitude IS NOT NULL AND location_longitude IS NOT NULL)
  ),
  ADD CONSTRAINT skills_location_latitude_range CHECK (
    location_latitude IS NULL OR location_latitude BETWEEN -90 AND 90
  ),
  ADD CONSTRAINT skills_location_longitude_range CHECK (
    location_longitude IS NULL OR location_longitude BETWEEN -180 AND 180
  );

CREATE INDEX IF NOT EXISTS skills_location_coordinates_idx
  ON skills(location_latitude, location_longitude)
  WHERE status = 'published' AND location_latitude IS NOT NULL;
