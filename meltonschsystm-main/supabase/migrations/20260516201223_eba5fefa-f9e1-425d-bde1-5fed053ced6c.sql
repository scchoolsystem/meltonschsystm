SET session_replication_role = 'replica';

DELETE FROM public.user_credentials WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'meltongraymond1@gmail.com');
DELETE FROM public.user_roles       WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'meltongraymond1@gmail.com');
DELETE FROM public.profiles         WHERE id      IN (SELECT id FROM auth.users WHERE email = 'meltongraymond1@gmail.com');
DELETE FROM auth.users              WHERE email = 'meltongraymond1@gmail.com';

SET session_replication_role = 'origin';