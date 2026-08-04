-- 074_organization_plans.sql
-- Add subscription_plan and onboarding_completed fields to organizations

ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'FREE';

ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- For existing organizations, set them as already onboarded and on the FREE plan
UPDATE organizations 
SET onboarding_completed = true, 
    subscription_plan = 'FREE' 
WHERE onboarding_completed = false;
