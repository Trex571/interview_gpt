import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action } = await req.json();

    switch (action) {
      case 'check_credits':
        return await checkAndUpdateCredits();
      case 'reset_credits':
        return await resetCredits();
      case 'get_exhausted_models':
        return await getExhaustedModels();
      default:
        throw new Error('Unknown action');
    }
  } catch (error) {
    console.error('Error in credit-monitor:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

async function checkAndUpdateCredits() {
  const now = new Date();
  
  // Get all models
  const { data: models } = await supabase
    .from('ai_models')
    .select('*');

  if (!models) {
    throw new Error('Failed to fetch models');
  }

  const exhaustedModels = [];
  const updates = [];

  for (const model of models) {
    let needsUpdate = false;
    let newStatus = model.credit_status;
    let newDailyUsage = model.current_daily_usage;
    let newMonthlyUsage = model.current_monthly_usage;
    let newDailyReset = model.last_reset_daily;
    let newMonthlyReset = model.last_reset_monthly;

    // Check if daily reset is needed
    const lastDailyReset = new Date(model.last_reset_daily);
    const daysSinceReset = Math.floor((now.getTime() - lastDailyReset.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceReset >= 1) {
      newDailyUsage = 0;
      newDailyReset = now.toISOString();
      needsUpdate = true;
    }

    // Check if monthly reset is needed
    const lastMonthlyReset = new Date(model.last_reset_monthly);
    const monthsSinceReset = (now.getFullYear() - lastMonthlyReset.getFullYear()) * 12 + 
                            (now.getMonth() - lastMonthlyReset.getMonth());
    
    if (monthsSinceReset >= 1) {
      newMonthlyUsage = 0;
      newMonthlyReset = now.toISOString();
      needsUpdate = true;
    }

    // Check credit limits
    const dailyExceeded = model.daily_limit > 0 && newDailyUsage >= model.daily_limit;
    const monthlyExceeded = model.monthly_limit > 0 && newMonthlyUsage >= model.monthly_limit;
    
    if (dailyExceeded || monthlyExceeded) {
      newStatus = false;
      if (model.credit_status) {
        exhaustedModels.push({
          codename: model.codename,
          reason: dailyExceeded ? 'Daily limit exceeded' : 'Monthly limit exceeded',
          usage: dailyExceeded ? newDailyUsage : newMonthlyUsage,
          limit: dailyExceeded ? model.daily_limit : model.monthly_limit
        });
      }
      needsUpdate = true;
    } else if (!model.credit_status && (daysSinceReset >= 1 || monthsSinceReset >= 1)) {
      // Re-enable if credits have reset
      newStatus = true;
      needsUpdate = true;
    }

    if (needsUpdate) {
      updates.push({
        codename: model.codename,
        credit_status: newStatus,
        current_daily_usage: newDailyUsage,
        current_monthly_usage: newMonthlyUsage,
        last_reset_daily: newDailyReset,
        last_reset_monthly: newMonthlyReset,
        last_checked: now.toISOString()
      });
    }
  }

  // Batch update models
  for (const update of updates) {
    await supabase
      .from('ai_models')
      .update(update)
      .eq('codename', update.codename);
  }

  return new Response(
    JSON.stringify({
      success: true,
      exhaustedModels,
      updatedModels: updates.length,
      timestamp: now.toISOString()
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function resetCredits() {
  const now = new Date();
  
  const { error } = await supabase
    .from('ai_models')
    .update({
      current_daily_usage: 0,
      current_monthly_usage: 0,
      credit_status: true,
      last_reset_daily: now.toISOString(),
      last_reset_monthly: now.toISOString(),
      last_checked: now.toISOString()
    })
    .neq('codename', '');

  if (error) throw error;

  return new Response(
    JSON.stringify({ success: true, message: 'All credits reset' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function getExhaustedModels() {
  const { data: models } = await supabase
    .from('ai_models')
    .select('codename, original_name, credit_status, current_daily_usage, current_monthly_usage, daily_limit, monthly_limit')
    .eq('credit_status', false);

  const exhaustedModels = (models || []).map(model => ({
    codename: model.codename,
    name: model.original_name,
    dailyUsage: model.current_daily_usage,
    monthlyUsage: model.current_monthly_usage,
    dailyLimit: model.daily_limit,
    monthlyLimit: model.monthly_limit,
    reason: model.daily_limit > 0 && model.current_daily_usage >= model.daily_limit 
      ? 'Daily limit exceeded' 
      : 'Monthly limit exceeded'
  }));

  return new Response(
    JSON.stringify({ exhaustedModels }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}