// Test script to verify staff categories are loading
// Run this in browser console on the invite dialog page

console.log('=== Staff Categories Debug Test ===');

// 1. Check if Supabase client is available
console.log('1. Supabase client:', window.supabase ? '✅ Available' : '❌ Not found');

// 2. Get current user
const { data: { user } } = await window.supabase.auth.getUser();
console.log('2. Current user:', user?.email || '❌ Not logged in');

// 3. Get restaurant ID from context (check localStorage or session)
const restaurantId = localStorage.getItem('selectedRestaurantId') ||
    sessionStorage.getItem('restaurantId');
console.log('3. Restaurant ID:', restaurantId || '❌ Not found');

// 4. Check if staff_categories table exists
const { data: tableCheck, error: tableError } = await window.supabase
    .from('staff_categories')
    .select('count')
    .limit(1);
console.log('4. Table exists:', tableError ? `❌ ${tableError.message}` : '✅ Yes');

// 5. Fetch categories for the restaurant
if (restaurantId) {
    const { data: categories, error: catError } = await window.supabase
        .from('staff_categories')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('name', { ascending: true });

    console.log('5. Categories query result:');
    console.log('   - Error:', catError || 'None');
    console.log('   - Count:', categories?.length || 0);
    console.log('   - Data:', categories);
} else {
    console.log('5. ❌ Cannot fetch categories - no restaurant ID');
}

// 6. Check permissions table
const { data: permissions, error: permError } = await window.supabase
    .from('permissions')
    .select('count');
console.log('6. Permissions table:', permError ? `❌ ${permError.message}` : `✅ ${permissions?.length || 0} permissions`);

// 7. Check RLS policies
console.log('\n7. If you see errors above, check:');
console.log('   - Is the migration run? (Check Supabase Table Editor)');
console.log('   - Are you logged in as restaurant admin?');
console.log('   - Does restaurant_id match your categories?');

console.log('\n=== End Debug Test ===');
