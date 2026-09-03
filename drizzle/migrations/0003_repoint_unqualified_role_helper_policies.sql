DO $do$
DECLARE
  r record; new_qual text; new_check text; roles_txt text; stmt text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual,'') || coalesce(with_check,'')) ~ '(^|[^.a-zA-Z0-9_])(has_role|is_admin|is_staff|is_supervisor_or_admin)\('
  LOOP
    new_qual  := regexp_replace(coalesce(r.qual,''),  '(^|[^.a-zA-Z0-9_])(has_role|is_admin|is_staff|is_supervisor_or_admin)\(', '\1private.\2(', 'g');
    new_check := regexp_replace(coalesce(r.with_check,''), '(^|[^.a-zA-Z0-9_])(has_role|is_admin|is_staff|is_supervisor_or_admin)\(', '\1private.\2(', 'g');
    roles_txt := array_to_string(r.roles, ', ');

    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    stmt := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
                   r.policyname, r.schemaname, r.tablename,
                   CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
                   r.cmd, roles_txt);
    IF r.qual IS NOT NULL THEN stmt := stmt || format(' USING (%s)', new_qual); END IF;
    IF r.with_check IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', new_check); END IF;
    EXECUTE stmt;
  END LOOP;
END
$do$;