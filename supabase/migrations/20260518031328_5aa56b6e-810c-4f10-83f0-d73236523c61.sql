
-- ============================================================
-- Week 2 hardening: race conditions, parent code hash, book stock, indexes
-- ============================================================

-- 1. Advisory-locked numbering generators ---------------------

CREATE OR REPLACE FUNCTION public.gen_admission_no()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE yr text := to_char(now(),'YYYY'); n int; sch uuid := COALESCE(NEW.school_id, public.current_user_school());
BEGIN
  IF NEW.admission_no IS NULL OR NEW.admission_no = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('admission_no:'||COALESCE(sch::text,'global')||':'||yr));
    SELECT COALESCE(MAX(CAST(split_part(admission_no,'-',2) AS int)),0)+1 INTO n
      FROM public.students WHERE admission_no LIKE yr||'-%';
    NEW.admission_no := yr||'-'||lpad(n::text,5,'0');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.gen_invoice_no()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE yr text := to_char(now(),'YYYY'); n int; sch uuid := COALESCE(NEW.school_id, public.current_user_school());
BEGIN
  IF NEW.invoice_no IS NULL OR NEW.invoice_no='' THEN
    PERFORM pg_advisory_xact_lock(hashtext('invoice_no:'||COALESCE(sch::text,'global')||':'||yr));
    SELECT COALESCE(MAX(CAST(split_part(invoice_no,'-',2) AS int)),0)+1 INTO n
      FROM public.invoices WHERE invoice_no LIKE 'INV'||yr||'-%';
    NEW.invoice_no := 'INV'||yr||'-'||lpad(n::text,5,'0');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.gen_receipt_no()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE yr text := to_char(now(),'YYYY'); n int; sch uuid := COALESCE(NEW.school_id, public.current_user_school());
BEGIN
  IF NEW.receipt_no IS NULL OR NEW.receipt_no='' THEN
    PERFORM pg_advisory_xact_lock(hashtext('receipt_no:'||COALESCE(sch::text,'global')||':'||yr));
    SELECT COALESCE(MAX(CAST(split_part(receipt_no,'-',2) AS int)),0)+1 INTO n
      FROM public.payments WHERE receipt_no LIKE 'RCT'||yr||'-%';
    NEW.receipt_no := 'RCT'||yr||'-'||lpad(n::text,5,'0');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.gen_employee_no()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE n int; sch uuid := COALESCE(NEW.school_id, public.current_user_school());
BEGIN
  IF NEW.employee_no IS NULL OR NEW.employee_no = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('employee_no:'||COALESCE(sch::text,'global')));
    SELECT COALESCE(MAX(CAST(substring(employee_no FROM 4) AS int)),1000)+1 INTO n
      FROM public.staff WHERE employee_no LIKE 'EMP%';
    NEW.employee_no := 'EMP'||n::text;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.gen_platform_invoice_no()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE yr text := to_char(now(),'YYYY'); n int;
BEGIN
  IF NEW.invoice_no IS NULL OR NEW.invoice_no='' THEN
    PERFORM pg_advisory_xact_lock(hashtext('platform_invoice_no:'||yr));
    SELECT COALESCE(MAX(CAST(split_part(invoice_no,'-',2) AS int)),0)+1 INTO n
      FROM public.platform_invoices WHERE invoice_no LIKE 'PINV'||yr||'-%';
    NEW.invoice_no := 'PINV'||yr||'-'||lpad(n::text,5,'0');
  END IF;
  RETURN NEW;
END $$;

-- 2. Lock invoice when recomputing paid total -----------------

CREATE OR REPLACE FUNCTION public.update_invoice_paid()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE total numeric(12,2); inv_amt numeric(12,2); inv uuid;
BEGIN
  inv := COALESCE(NEW.invoice_id, OLD.invoice_id);
  PERFORM pg_advisory_xact_lock(hashtext('invoice_paid:'||inv::text));
  SELECT COALESCE(SUM(amount),0) INTO total FROM public.payments WHERE invoice_id = inv;
  SELECT amount INTO inv_amt FROM public.invoices WHERE id = inv;
  UPDATE public.invoices SET paid = total,
    status = CASE WHEN total >= inv_amt THEN 'paid' WHEN total > 0 THEN 'partial' ELSE 'unpaid' END
    WHERE id = inv;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.update_platform_invoice_paid()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE total numeric(12,2); inv_amt numeric(12,2); inv uuid;
BEGIN
  inv := COALESCE(NEW.invoice_id, OLD.invoice_id);
  PERFORM pg_advisory_xact_lock(hashtext('platform_invoice_paid:'||inv::text));
  SELECT COALESCE(SUM(amount),0) INTO total FROM public.platform_payments WHERE invoice_id = inv;
  SELECT amount INTO inv_amt FROM public.platform_invoices WHERE id = inv;
  UPDATE public.platform_invoices SET paid = total,
    status = CASE WHEN total >= inv_amt THEN 'paid' WHEN total > 0 THEN 'partial' ELSE 'unpaid' END
    WHERE id = inv;
  RETURN NULL;
END $$;

-- 3. Parent auth code: keep hash in sync ----------------------

CREATE OR REPLACE FUNCTION public.sync_parent_code_hash()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.parent_auth_code IS NOT NULL AND NEW.parent_auth_code <> '' THEN
    NEW.parent_auth_code_hash := encode(digest(upper(NEW.parent_auth_code), 'sha256'), 'hex');
  ELSE
    NEW.parent_auth_code_hash := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_parent_code_hash ON public.students;
CREATE TRIGGER trg_sync_parent_code_hash
BEFORE INSERT OR UPDATE OF parent_auth_code ON public.students
FOR EACH ROW EXECUTE FUNCTION public.sync_parent_code_hash();

-- Backfill existing rows (pgcrypto required for digest)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
UPDATE public.students
   SET parent_auth_code_hash = encode(digest(upper(parent_auth_code), 'sha256'), 'hex')
 WHERE parent_auth_code IS NOT NULL AND parent_auth_code <> ''
   AND parent_auth_code_hash IS NULL;

CREATE INDEX IF NOT EXISTS idx_students_parent_auth_code_hash
  ON public.students (parent_auth_code_hash) WHERE parent_auth_code_hash IS NOT NULL;

-- 4. Book loan stock control ----------------------------------

CREATE OR REPLACE FUNCTION public.enforce_book_stock()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE avail int;
BEGIN
  IF TG_OP = 'INSERT' AND COALESCE(NEW.status,'active') = 'active' THEN
    SELECT copies_available INTO avail FROM public.books WHERE id = NEW.book_id FOR UPDATE;
    IF avail IS NULL THEN RAISE EXCEPTION 'Book not found'; END IF;
    IF avail <= 0 THEN RAISE EXCEPTION 'No copies available to lend'; END IF;
    UPDATE public.books SET copies_available = copies_available - 1 WHERE id = NEW.book_id;
  ELSIF TG_OP = 'UPDATE'
        AND OLD.status = 'active'
        AND NEW.status IN ('returned','lost')
        AND OLD.returned_on IS NULL THEN
    IF NEW.status = 'returned' THEN
      UPDATE public.books SET copies_available = LEAST(copies_total, copies_available + 1)
        WHERE id = NEW.book_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_book_stock ON public.book_loans;
CREATE TRIGGER trg_enforce_book_stock
BEFORE INSERT OR UPDATE OF status ON public.book_loans
FOR EACH ROW EXECUTE FUNCTION public.enforce_book_stock();

-- 5. Missing indexes ------------------------------------------

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_student ON public.invoices (student_id);
CREATE INDEX IF NOT EXISTS idx_parent_links_student ON public.parent_student_links (student_id);
CREATE INDEX IF NOT EXISTS idx_parent_links_parent ON public.parent_student_links (parent_user_id);
CREATE INDEX IF NOT EXISTS idx_discipline_student ON public.discipline_records (student_id, incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_book_loans_student ON public.book_loans (student_id) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_book_loans_book ON public.book_loans (book_id, status);
CREATE INDEX IF NOT EXISTS idx_lifecycle_target ON public.lifecycle_events (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_school_created ON public.activity_logs (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON public.attendance_records (student_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_exam_results_student ON public.exam_results (student_id);
