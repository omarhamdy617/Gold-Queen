-- ==========================================================================
-- جولد كوين - Gold Queen ERP - بيانات التهيئة الأولى (Seed)
-- شغّل هذا الملف مرة واحدة فقط، بعد تشغيل ملف الـ migration الأساسي (0000_...)
-- ==========================================================================
DO $$
DECLARE
  v_admin_role_id text;
  v_accountant_role_id text;
  v_warehouse_role_id text;
  v_cashier_role_id text;
  v_admin_user_id text;
  v_pm_id text;
BEGIN
  -- 1) الأدوار الأساسية
  INSERT INTO roles (id, name, built_in) VALUES (gen_random_uuid()::text, 'ADMIN', true)
    ON CONFLICT (name) DO NOTHING;
  INSERT INTO roles (id, name, built_in) VALUES (gen_random_uuid()::text, 'ACCOUNTANT', true)
    ON CONFLICT (name) DO NOTHING;
  INSERT INTO roles (id, name, built_in) VALUES (gen_random_uuid()::text, 'WAREHOUSE_KEEPER', true)
    ON CONFLICT (name) DO NOTHING;
  INSERT INTO roles (id, name, built_in) VALUES (gen_random_uuid()::text, 'CASHIER', true)
    ON CONFLICT (name) DO NOTHING;

  SELECT id INTO v_admin_role_id FROM roles WHERE name = 'ADMIN';
  SELECT id INTO v_accountant_role_id FROM roles WHERE name = 'ACCOUNTANT';
  SELECT id INTO v_warehouse_role_id FROM roles WHERE name = 'WAREHOUSE_KEEPER';
  SELECT id INTO v_cashier_role_id FROM roles WHERE name = 'CASHIER';

  -- 2) صلاحيات المحاسب
  INSERT INTO permissions (id, key, role_id, allow)
  SELECT gen_random_uuid()::text, k, v_accountant_role_id, true
  FROM unnest(ARRAY[
    'dashboard.view','cash.view','products.view','inventory.view','purchases.view',
    'sales.view','customers.manage','customers.statement','expenses.manage',
    'reports.view','finance.view','quotes.manage'
  ]) AS k
  WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE role_id = v_accountant_role_id AND key = k);

  -- 3) صلاحيات أمين المخزن
  INSERT INTO permissions (id, key, role_id, allow)
  SELECT gen_random_uuid()::text, k, v_warehouse_role_id, true
  FROM unnest(ARRAY[
    'dashboard.view','products.view','products.manage','products.barcode.print',
    'inventory.view','purchases.create','purchases.view','transfers.create','orders.manage'
  ]) AS k
  WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE role_id = v_warehouse_role_id AND key = k);

  -- 4) صلاحيات الكاشير
  INSERT INTO permissions (id, key, role_id, allow)
  SELECT gen_random_uuid()::text, k, v_cashier_role_id, true
  FROM unnest(ARRAY[
    'dashboard.view','products.view','sales.create','sales.view','quotes.manage',
    'customers.manage','returns.create','orders.manage','cash.view'
  ]) AS k
  WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE role_id = v_cashier_role_id AND key = k);

  -- 5) حساب الأدمن الأول
  -- username: admin | password: goldqueen123  (غيّره فورًا بعد أول دخول من شاشة المستخدمين)
  IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin') THEN
    INSERT INTO users (id, username, full_name, password_hash, active, role_id)
    VALUES (
      gen_random_uuid()::text,
      'admin',
      'المدير العام',
      '$2b$10$9a6Qe4w7E.jXJvgYJEEtlOkEpPVtWC4Ub7VzG4o2mZSPcIfsnA1GS',
      true,
      v_admin_role_id
    );
  END IF;

  -- 6) طرق الدفع الافتراضية + خزائنها
  IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE name = 'كاش') THEN
    INSERT INTO payment_methods (id, name) VALUES (gen_random_uuid()::text, 'كاش') RETURNING id INTO v_pm_id;
    INSERT INTO cash_drawers (id, name, payment_method_id) VALUES (gen_random_uuid()::text, 'خزينة كاش', v_pm_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE name = 'فودافون كاش') THEN
    INSERT INTO payment_methods (id, name) VALUES (gen_random_uuid()::text, 'فودافون كاش') RETURNING id INTO v_pm_id;
    INSERT INTO cash_drawers (id, name, payment_method_id) VALUES (gen_random_uuid()::text, 'خزينة فودافون كاش', v_pm_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE name = 'إنستا باي') THEN
    INSERT INTO payment_methods (id, name) VALUES (gen_random_uuid()::text, 'إنستا باي') RETURNING id INTO v_pm_id;
    INSERT INTO cash_drawers (id, name, payment_method_id) VALUES (gen_random_uuid()::text, 'خزينة إنستا باي', v_pm_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE name = 'تحويل بنكي') THEN
    INSERT INTO payment_methods (id, name) VALUES (gen_random_uuid()::text, 'تحويل بنكي') RETURNING id INTO v_pm_id;
    INSERT INTO cash_drawers (id, name, payment_method_id) VALUES (gen_random_uuid()::text, 'خزينة تحويل بنكي', v_pm_id);
  END IF;

  -- 7) المحل والمخزن الافتراضيين
  IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'المحل') THEN
    INSERT INTO locations (id, name, type) VALUES (gen_random_uuid()::text, 'المحل', 'SHOP');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'المخزن') THEN
    INSERT INTO locations (id, name, type) VALUES (gen_random_uuid()::text, 'المخزن', 'WAREHOUSE');
  END IF;

  -- 8) الإعدادات الافتراضية
  IF NOT EXISTS (SELECT 1 FROM settings) THEN
    INSERT INTO settings (id, company_name) VALUES (1, 'جولد كوين');
  END IF;
END $$;
