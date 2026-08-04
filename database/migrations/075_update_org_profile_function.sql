-- 075_update_org_profile_function.sql
-- Update organization profile functions to include new fields

DROP FUNCTION IF EXISTS fn_get_organization_profile(INTEGER);
DROP FUNCTION IF EXISTS fn_update_organization_profile(INTEGER, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION fn_get_organization_profile(p_org_id INTEGER)
RETURNS TABLE (
    id INTEGER,
    name VARCHAR(255),
    logo_url VARCHAR(1024),
    website VARCHAR(255),
    description TEXT,
    industry VARCHAR(100),
    company_size VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE,
    owner_name VARCHAR(255),
    owner_email VARCHAR(255),
    members_count BIGINT,
    projects_count BIGINT,
    subscription_plan VARCHAR(50),
    onboarding_completed BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.name,
        o.logo_url,
        o.website,
        o.description,
        o.industry,
        o.company_size,
        o.created_at,
        (SELECT CONCAT_WS(' ', u.first_name, u.last_name)::VARCHAR FROM users u WHERE u.organization_id = o.id AND u.role = 'SUPER_ADMIN' AND u.deleted_at IS NULL ORDER BY u.created_at ASC LIMIT 1) as owner_name,
        (SELECT u.email::VARCHAR FROM users u WHERE u.organization_id = o.id AND u.role = 'SUPER_ADMIN' AND u.deleted_at IS NULL ORDER BY u.created_at ASC LIMIT 1) as owner_email,
        (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id AND u.deleted_at IS NULL) as members_count,
        (SELECT COUNT(*) FROM boards b WHERE b.organization_id = o.id AND b.deleted_at IS NULL) as projects_count,
        o.subscription_plan,
        o.onboarding_completed
    FROM organizations o
    WHERE o.id = p_org_id AND o.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION fn_update_organization_profile(
    p_org_id INTEGER,
    p_name VARCHAR(255) DEFAULT NULL,
    p_logo_url VARCHAR(1024) DEFAULT NULL,
    p_website VARCHAR(255) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_industry VARCHAR(100) DEFAULT NULL,
    p_company_size VARCHAR(50) DEFAULT NULL,
    p_subscription_plan VARCHAR(50) DEFAULT NULL,
    p_onboarding_completed BOOLEAN DEFAULT NULL
)
RETURNS TABLE (
    id INTEGER,
    name VARCHAR(255),
    logo_url VARCHAR(1024),
    website VARCHAR(255),
    description TEXT,
    industry VARCHAR(100),
    company_size VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE,
    owner_name VARCHAR(255),
    owner_email VARCHAR(255),
    members_count BIGINT,
    projects_count BIGINT,
    subscription_plan VARCHAR(50),
    onboarding_completed BOOLEAN
) AS $$
BEGIN
    UPDATE organizations
    SET
        name = COALESCE(p_name, organizations.name),
        logo_url = COALESCE(p_logo_url, organizations.logo_url),
        website = COALESCE(p_website, organizations.website),
        description = COALESCE(p_description, organizations.description),
        industry = COALESCE(p_industry, organizations.industry),
        company_size = COALESCE(p_company_size, organizations.company_size),
        subscription_plan = COALESCE(p_subscription_plan, organizations.subscription_plan),
        onboarding_completed = COALESCE(p_onboarding_completed, organizations.onboarding_completed)
    WHERE organizations.id = p_org_id AND organizations.deleted_at IS NULL;

    RETURN QUERY
    SELECT * FROM fn_get_organization_profile(p_org_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
