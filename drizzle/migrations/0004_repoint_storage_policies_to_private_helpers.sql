DROP POLICY IF EXISTS "Staff can upload language audio" ON storage.objects;
CREATE POLICY "Staff can upload language audio" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'language-audio' AND private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can update language audio" ON storage.objects;
CREATE POLICY "Staff can update language audio" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'language-audio' AND private.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'language-audio' AND private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can delete language audio" ON storage.objects;
CREATE POLICY "Staff can delete language audio" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'language-audio' AND private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins full access language audio" ON storage.objects;
CREATE POLICY "Admins full access language audio" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'language-audio' AND private.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'language-audio' AND private.is_admin(auth.uid()));