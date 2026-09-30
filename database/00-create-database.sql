-- Run while connected to the administrative `postgres` database.
-- Replace these example names/password before using RDS.
CREATE ROLE contactos_app LOGIN PASSWORD 'REPLACE_WITH_A_SECRET';
CREATE DATABASE contactos OWNER contactos_app ENCODING 'UTF8';
