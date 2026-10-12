-- Runs once, when the docker volume is created. Tests use this database only
-- (DATABASE_TEST_URL must point at a database whose name ends with "_test").
CREATE DATABASE weather_test OWNER weather;
