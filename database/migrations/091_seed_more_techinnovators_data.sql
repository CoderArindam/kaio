-- 091_seed_more_techinnovators_data.sql
-- Seed more users, tasks, and timesheets for TechInnovators

-- Fix fn_log_task_time ambiguity caused by 087_subtask_assignee_time.sql overloaded function
CREATE OR REPLACE FUNCTION fn_log_task_time(
    p_user_id UUID,
    p_org_id UUID,
    p_task_id INT,
    p_entry_date DATE,
    p_hours NUMERIC(4,2),
    p_description TEXT DEFAULT NULL
)
RETURNS SETOF v_tasks_canonical AS $$
DECLARE
    v_board_id_int INT;
    v_assigned_to_int INT;
    v_week_start DATE;
    v_ts_id UUID;
    v_ts_status timesheet_status;
    v_task_uuid UUID;
    v_board_uuid UUID;
    v_ts_row RECORD;
BEGIN
    SELECT board_id, assigned_to INTO v_board_id_int, v_assigned_to_int
    FROM tasks
    WHERE id = p_task_id AND deleted_at IS NULL;

    IF v_board_id_int IS NULL THEN
        RAISE EXCEPTION 'TASK_NOT_FOUND: Task % does not exist', p_task_id;
    END IF;

    v_week_start := date_trunc('week', p_entry_date)::date;

    SELECT id, status INTO v_ts_id, v_ts_status
    FROM timesheets
    WHERE org_id = p_org_id AND user_id = p_user_id AND week_start_date = v_week_start
    FOR UPDATE;

    IF v_ts_id IS NULL THEN
        SELECT * INTO v_ts_row FROM fn_create_timesheet(p_user_id, p_org_id, v_week_start);
        v_ts_id := v_ts_row.id;
        v_ts_status := 'draft';
    ELSIF v_ts_status != 'draft' THEN
        RAISE EXCEPTION 'TIMESHEET_LOCKED: Timesheet for week of % is % and cannot be modified', v_week_start, v_ts_status;
    END IF;

    v_task_uuid := ('00000000-0000-0000-0000-' || LPAD(p_task_id::text, 12, '0'))::uuid;
    v_board_uuid := ('00000000-0000-0000-0000-' || LPAD(v_board_id_int::text, 12, '0'))::uuid;

    -- Explicitly pass 10 arguments to avoid AmbiguousFunctionError
    PERFORM fn_upsert_timesheet_entry(
        v_ts_id,
        p_user_id,
        v_board_uuid,
        v_task_uuid,
        p_entry_date,
        p_hours,
        'task'::timesheet_entry_type,
        p_description,
        NULL::uuid,
        NULL::uuid
    );

    RETURN QUERY SELECT * FROM v_tasks_canonical WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    v_org_id INTEGER;
    v_admin_id INTEGER;
    v_priya_id INTEGER;
    v_rohan_id INTEGER;
    v_sneha_id INTEGER;
    
    v_neha_id INTEGER;
    v_arjun_id INTEGER;
    v_vikram_id INTEGER;
    v_kavya_id INTEGER;
    v_siddharth_id INTEGER;

    v_pay_board_id INTEGER;
    v_fin_board_id INTEGER;
    v_ai_board_id INTEGER;

    v_pay_todo_col INTEGER;
    v_pay_prog_col INTEGER;
    v_pay_done_col INTEGER;

    v_fin_todo_col INTEGER;
    v_fin_prog_col INTEGER;
    v_fin_done_col INTEGER;

    v_ai_todo_col INTEGER;
    v_ai_prog_col INTEGER;
    v_ai_done_col INTEGER;

    v_pwd_hash VARCHAR := '$2b$12$5ZIUXiyEDnVJUWd.qu0/3uGY7tsFX85o.pQi6oOllmXH6radlM5TS';
    v_now TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP;
    v_15d_ago TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP - INTERVAL '15 days';
    v_30d_ago TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP - INTERVAL '30 days';
    
    v_task_id INTEGER;
    v_date DATE;
    v_day_offset INTEGER;
BEGIN
    -- Change default permission for board_members to EDITOR based on user request
    ALTER TABLE board_members ALTER COLUMN permission SET DEFAULT 'EDITOR';

    -- Find TechInnovators organization
    SELECT id INTO v_org_id FROM organizations WHERE name = 'TechInnovators India' LIMIT 1;
    
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'TechInnovators India organization not found.';
    END IF;

    -- Fetch existing users
    SELECT id INTO v_admin_id FROM users WHERE email = 'admin@techinnovators.com';
    SELECT id INTO v_priya_id FROM users WHERE email = 'priya.patel@techinnovators.com';
    SELECT id INTO v_rohan_id FROM users WHERE email = 'rohan.gupta@techinnovators.com';
    SELECT id INTO v_sneha_id FROM users WHERE email = 'sneha.reddy@techinnovators.com';

    -- Seed New Users
    INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role, is_email_verified, created_at)
    VALUES (v_org_id, 'neha.sharma@techinnovators.com', v_pwd_hash, 'Neha', 'Sharma', 'MANAGER', true, v_30d_ago)
    RETURNING id INTO v_neha_id;

    INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role, is_email_verified, created_at)
    VALUES (v_org_id, 'arjun.nair@techinnovators.com', v_pwd_hash, 'Arjun', 'Nair', 'MEMBER', true, v_30d_ago)
    RETURNING id INTO v_arjun_id;

    INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role, is_email_verified, created_at)
    VALUES (v_org_id, 'vikram.singh@techinnovators.com', v_pwd_hash, 'Vikram', 'Singh', 'MEMBER', true, v_30d_ago)
    RETURNING id INTO v_vikram_id;

    INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role, is_email_verified, created_at)
    VALUES (v_org_id, 'kavya.iyer@techinnovators.com', v_pwd_hash, 'Kavya', 'Iyer', 'MEMBER', true, v_30d_ago)
    RETURNING id INTO v_kavya_id;

    INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role, is_email_verified, created_at)
    VALUES (v_org_id, 'siddharth.desai@techinnovators.com', v_pwd_hash, 'Siddharth', 'Desai', 'MEMBER', true, v_30d_ago)
    RETURNING id INTO v_siddharth_id;

    -- Fetch existing boards
    SELECT id INTO v_pay_board_id FROM boards WHERE project_key = 'PAY' AND organization_id = v_org_id;
    SELECT id INTO v_fin_board_id FROM boards WHERE project_key = 'FIN' AND organization_id = v_org_id;
    SELECT id INTO v_ai_board_id FROM boards WHERE project_key = 'AI' AND organization_id = v_org_id;

    -- Update existing simple members in board_members to EDITOR (as requested)
    UPDATE board_members 
    SET permission = 'EDITOR' 
    WHERE permission = 'VIEWER' AND board_id IN (v_pay_board_id, v_fin_board_id, v_ai_board_id);

    -- Configure Board Memberships (Default is now EDITOR)
    INSERT INTO board_members (board_id, user_id) VALUES
    (v_fin_board_id, v_neha_id),
    (v_ai_board_id, v_neha_id),
    (v_pay_board_id, v_arjun_id),
    (v_fin_board_id, v_arjun_id),
    (v_pay_board_id, v_vikram_id),
    (v_fin_board_id, v_vikram_id),
    (v_ai_board_id, v_kavya_id),
    (v_pay_board_id, v_siddharth_id),
    (v_ai_board_id, v_siddharth_id)
    ON CONFLICT (board_id, user_id) DO UPDATE SET permission = 'EDITOR';

    -- Fetch Column IDs
    SELECT id INTO v_pay_todo_col FROM board_columns WHERE board_id = v_pay_board_id AND column_type = 'TODO' LIMIT 1;
    SELECT id INTO v_pay_prog_col FROM board_columns WHERE board_id = v_pay_board_id AND column_type = 'IN_PROGRESS' LIMIT 1;
    SELECT id INTO v_pay_done_col FROM board_columns WHERE board_id = v_pay_board_id AND column_type = 'DONE' LIMIT 1;

    SELECT id INTO v_fin_todo_col FROM board_columns WHERE board_id = v_fin_board_id AND column_type = 'TODO' LIMIT 1;
    SELECT id INTO v_fin_prog_col FROM board_columns WHERE board_id = v_fin_board_id AND column_type = 'IN_PROGRESS' LIMIT 1;
    SELECT id INTO v_fin_done_col FROM board_columns WHERE board_id = v_fin_board_id AND column_type = 'DONE' LIMIT 1;

    SELECT id INTO v_ai_todo_col FROM board_columns WHERE board_id = v_ai_board_id AND column_type = 'TODO' LIMIT 1;
    SELECT id INTO v_ai_prog_col FROM board_columns WHERE board_id = v_ai_board_id AND column_type = 'IN_PROGRESS' LIMIT 1;
    SELECT id INTO v_ai_done_col FROM board_columns WHERE board_id = v_ai_board_id AND column_type = 'DONE' LIMIT 1;

    -- Set context for fn_log_task_time (needs admin for bypassing checks sometimes)
    PERFORM set_config('app.current_user_id', v_admin_id::TEXT, true);

    -- Seed New Tasks & Timesheets
    -- Convert v_org_id to UUID format used in fn_log_task_time
    DECLARE
        v_org_uuid UUID := ('00000000-0000-0000-0000-' || LPAD(v_org_id::text, 12, '0'))::uuid;
        
        -- We will create a helper inline function for logging time
        v_user_uuid UUID;
        
        v_task_pay_1 INTEGER;
        v_task_pay_2 INTEGER;
        v_task_pay_3 INTEGER;
        v_task_pay_4 INTEGER;
        
        v_task_fin_1 INTEGER;
        v_task_fin_2 INTEGER;
        v_task_fin_3 INTEGER;
        v_task_fin_4 INTEGER;

        v_task_ai_1 INTEGER;
        v_task_ai_2 INTEGER;
        v_task_ai_3 INTEGER;
        v_task_ai_4 INTEGER;
    BEGIN
        -- PAY Board
        INSERT INTO tasks (board_id, column_id, title, description, priority, assigned_to, created_by, due_date, estimate_hours)
        VALUES (v_pay_board_id, v_pay_prog_col, 'Update Webhook Secrets Rotation Policy', 'Ensure secrets rotate seamlessly.', 'High', v_siddharth_id, v_admin_id, v_now + INTERVAL '2 days', 12.0) RETURNING id INTO v_task_pay_1;
        
        INSERT INTO tasks (board_id, column_id, title, description, priority, assigned_to, created_by, due_date, estimate_hours)
        VALUES (v_pay_board_id, v_pay_todo_col, 'Implement React Native Checkout SDK', 'Add support for RN clients.', 'Medium', v_vikram_id, v_priya_id, v_now + INTERVAL '5 days', 24.0) RETURNING id INTO v_task_pay_2;
        
        INSERT INTO tasks (board_id, column_id, title, description, priority, assigned_to, created_by, due_date, estimate_hours)
        VALUES (v_pay_board_id, v_pay_done_col, 'Verify UI Edge Cases for UPI Intent', 'Test all corner cases.', 'Low', v_arjun_id, v_priya_id, v_15d_ago, 8.0) RETURNING id INTO v_task_pay_3;
        
        INSERT INTO tasks (board_id, column_id, title, description, priority, assigned_to, created_by, estimate_hours)
        VALUES (v_pay_board_id, v_pay_todo_col, 'Set up Datadog Alerts for Gateway Timeouts', 'Monitor failovers.', 'High', v_admin_id, v_admin_id, 4.0) RETURNING id INTO v_task_pay_4;

        -- FIN Board
        INSERT INTO tasks (board_id, column_id, title, description, priority, assigned_to, created_by, estimate_hours)
        VALUES (v_fin_board_id, v_fin_prog_col, 'Test Merchant Onboarding KYC flow', 'Run full integration tests on KYC APIs.', 'High', v_arjun_id, v_priya_id, 16.0) RETURNING id INTO v_task_fin_1;
        
        INSERT INTO tasks (board_id, column_id, title, description, priority, assigned_to, created_by, estimate_hours)
        VALUES (v_fin_board_id, v_fin_todo_col, 'Define requirements for new Crypto Wallet', 'Spec out the wallet features.', 'Medium', v_neha_id, v_admin_id, 10.0) RETURNING id INTO v_task_fin_2;
        
        INSERT INTO tasks (board_id, column_id, title, description, priority, assigned_to, created_by, estimate_hours)
        VALUES (v_fin_board_id, v_fin_prog_col, 'Migrate Dashboard components to Tailwind CSS', 'Remove legacy CSS.', 'Medium', v_vikram_id, v_sneha_id, 20.0) RETURNING id INTO v_task_fin_3;
        
        INSERT INTO tasks (board_id, column_id, title, description, priority, assigned_to, created_by, estimate_hours)
        VALUES (v_fin_board_id, v_fin_done_col, 'Conduct Pentest on OAuth2 endpoints', 'Security testing.', 'High', v_siddharth_id, v_admin_id, 16.0) RETURNING id INTO v_task_fin_4;

        -- AI Board
        INSERT INTO tasks (board_id, column_id, title, description, priority, assigned_to, created_by, estimate_hours)
        VALUES (v_ai_board_id, v_ai_prog_col, 'Test Pinecone Vector search latency', 'Benchmark latency.', 'Medium', v_arjun_id, v_admin_id, 8.0) RETURNING id INTO v_task_ai_1;
        
        INSERT INTO tasks (board_id, column_id, title, description, priority, assigned_to, created_by, estimate_hours)
        VALUES (v_ai_board_id, v_ai_todo_col, 'Evaluate OpenAI o1 models for reasoning', 'Test o1 vs gpt-4o.', 'High', v_neha_id, v_admin_id, 12.0) RETURNING id INTO v_task_ai_2;
        
        INSERT INTO tasks (board_id, column_id, title, description, priority, assigned_to, created_by, estimate_hours)
        VALUES (v_ai_board_id, v_ai_prog_col, 'Train custom NER model for financial terms', 'Fine-tune SpaCy.', 'High', v_kavya_id, v_priya_id, 40.0) RETURNING id INTO v_task_ai_3;
        
        INSERT INTO tasks (board_id, column_id, title, description, priority, assigned_to, created_by, estimate_hours)
        VALUES (v_ai_board_id, v_ai_done_col, 'Set up GPU instances on AWS for inference', 'Terraform AWS resources.', 'Medium', v_kavya_id, v_admin_id, 16.0) RETURNING id INTO v_task_ai_4;

        -- Seed 1 month of timesheets (last 20 weekdays)
        -- We'll log hours for Rohan, Sneha, Vikram, Kavya
        
        FOR v_day_offset IN 1..28 LOOP
            v_date := (CURRENT_DATE - INTERVAL '1 day' * (28 - v_day_offset))::date;
            
            -- Skip weekends (ISODOW 6=Sat, 7=Sun)
            IF EXTRACT(ISODOW FROM v_date) < 6 THEN
                
                -- Rohan (Backend - FIN/PAY)
                v_user_uuid := ('00000000-0000-0000-0000-' || LPAD(v_rohan_id::text, 12, '0'))::uuid;
                PERFORM fn_log_task_time(v_user_uuid, v_org_uuid, v_task_pay_1, v_date, 4.0, 'Working on webhook logic');
                PERFORM fn_log_task_time(v_user_uuid, v_org_uuid, v_task_fin_1, v_date, 4.0, 'Backend API integration');
                
                -- Sneha (UI/UX - FIN)
                v_user_uuid := ('00000000-0000-0000-0000-' || LPAD(v_sneha_id::text, 12, '0'))::uuid;
                PERFORM fn_log_task_time(v_user_uuid, v_org_uuid, v_task_fin_3, v_date, 6.0, 'Designing dashboard components');
                
                -- Vikram (Frontend)
                v_user_uuid := ('00000000-0000-0000-0000-' || LPAD(v_vikram_id::text, 12, '0'))::uuid;
                PERFORM fn_log_task_time(v_user_uuid, v_org_uuid, v_task_fin_3, v_date, 8.0, 'Implementing Tailwind UI');
                
                -- Kavya (AI)
                v_user_uuid := ('00000000-0000-0000-0000-' || LPAD(v_kavya_id::text, 12, '0'))::uuid;
                PERFORM fn_log_task_time(v_user_uuid, v_org_uuid, v_task_ai_3, v_date, 8.0, 'Training NER model on AWS');
                
            END IF;
        END LOOP;

    END;

END $$;
