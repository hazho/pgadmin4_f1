-- Column: testschema."table_1_$%{}[]()&*^!@""'`\/#"."new_col_2_$%{}[]()&*^!@""'`\/#"

-- ALTER TABLE IF EXISTS testschema."table_1_$%{}[]()&*^!@""'`\/#" DROP COLUMN IF EXISTS "new_col_2_$%{}[]()&*^!@""'`\/#";

ALTER TABLE IF EXISTS testschema."table_1_$%{}[]()&*^!@""'`\/#"
    ADD COLUMN IF NOT EXISTS "new_col_2_$%{}[]()&*^!@""'`\/#" character(1) COLLATE pg_catalog."C";

COMMENT ON COLUMN testschema."table_1_$%{}[]()&*^!@""'`\/#"."new_col_2_$%{}[]()&*^!@""'`\/#"
    IS 'Comment for alter';

ALTER TABLE IF EXISTS testschema."table_1_$%{}[]()&*^!@""'`\/#"
    ALTER COLUMN "new_col_2_$%{}[]()&*^!@""'`\/#" SET STATISTICS 5;

ALTER TABLE IF EXISTS testschema."table_1_$%{}[]()&*^!@""'`\/#"
    ALTER COLUMN "new_col_2_$%{}[]()&*^!@""'`\/#" SET STORAGE PLAIN;

GRANT INSERT("new_col_2_$%{}[]()&*^!@""'`\/#"), SELECT("new_col_2_$%{}[]()&*^!@""'`\/#"), REFERENCES("new_col_2_$%{}[]()&*^!@""'`\/#") ON testschema."table_1_$%{}[]()&*^!@""'`\/#" TO PUBLIC;
