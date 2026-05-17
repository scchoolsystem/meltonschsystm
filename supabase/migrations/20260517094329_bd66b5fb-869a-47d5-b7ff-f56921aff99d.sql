UPDATE auth.users
SET encrypted_password = crypt('Melton@2026!', gen_salt('bf')),
    updated_at = now()
WHERE lower(email) = 'meltongraymond1@gmail.com';