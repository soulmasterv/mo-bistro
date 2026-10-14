-- READ ONLY. Run only in the independently verified Preview database as the app role.
-- This diagnoses the reported capacity error; it does not repair or alter inventory.
BEGIN TRANSACTION READ ONLY;
SELECT current_database() AS database_name, current_schema() AS schema_name;
SELECT key,value FROM seating_settings
WHERE key IN ('table_view_mode','allow_area_override');
SELECT area,total_tables,occupied_tables,max_party_size,
 total_tables-occupied_tables AS free_tables
FROM simple_table_capacity ORDER BY area;
SELECT area,COUNT(*) FILTER (WHERE status='occupied') AS named_occupied,
 COUNT(*) AS named_total
FROM restaurant_tables GROUP BY area ORDER BY area;
COMMIT;
