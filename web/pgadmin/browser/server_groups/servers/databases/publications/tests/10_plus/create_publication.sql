-- Publication: test_publication_create

-- DROP PUBLICATION test_publication_create;

CREATE PUBLICATION test_publication_create
    FOR ALL TABLES
    WITH (publish = 'insert, update');
