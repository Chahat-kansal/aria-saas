-- Staff & Team Management Module

CREATE TABLE IF NOT EXISTS staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,

  first_name text NOT NULL,
  last_name text NOT NULL,
  preferred_name text,
  date_of_birth date,
  gender text,
  profile_photo_url text,

  personal_email text,
  work_email text,
  mobile text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,

  position text NOT NULL,
  department text,
  employment_type text DEFAULT 'full_time'
    CHECK (employment_type IN ('full_time','part_time','casual','contractor','volunteer')),
  start_date date,
  end_date date,
  status text DEFAULT 'active'
    CHECK (status IN ('active','on_leave','terminated','probation')),

  pay_type text DEFAULT 'hourly'
    CHECK (pay_type IN ('hourly','salary','daily','contractor')),
  pay_rate_cents integer,
  pay_per_annum_cents integer,
  pay_frequency text DEFAULT 'fortnightly'
    CHECK (pay_frequency IN ('weekly','fortnightly','monthly')),
  superannuation_rate numeric DEFAULT 11.5,
  tax_file_number text,
  bank_account_name text,
  bank_bsb text,
  bank_account_number text,

  right_to_work_verified boolean DEFAULT false,
  right_to_work_verified_date date,
  visa_type text,
  visa_subclass text,
  visa_expiry_date date,
  visa_work_restrictions text,
  passport_country text,
  passport_expiry_date date,

  notes text,
  custom_fields jsonb DEFAULT '{}',

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_staff" ON staff_members;
CREATE POLICY "own_staff" ON staff_members FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_staff_business ON staff_members(business_id);
CREATE INDEX IF NOT EXISTS idx_staff_visa_expiry ON staff_members(business_id, visa_expiry_date)
  WHERE visa_expiry_date IS NOT NULL AND status = 'active';

-- Staff documents
CREATE TABLE IF NOT EXISTS staff_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff_members(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  document_name text NOT NULL,
  file_url text,
  file_size integer,
  expiry_date date,
  notes text,
  uploaded_at timestamptz DEFAULT now()
);
ALTER TABLE staff_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_staff_docs" ON staff_documents;
CREATE POLICY "own_staff_docs" ON staff_documents FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Leave tracking
CREATE TABLE IF NOT EXISTS staff_leave (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff_members(id) ON DELETE CASCADE,
  leave_type text NOT NULL
    CHECK (leave_type IN ('annual','sick','personal','parental','long_service','unpaid','compassionate','other')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_taken numeric,
  status text DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled')),
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE staff_leave ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_staff_leave" ON staff_leave;
CREATE POLICY "own_staff_leave" ON staff_leave FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
