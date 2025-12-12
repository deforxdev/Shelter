// Supabase Configuration
const SUPABASE_URL = 'https://quldnqjfzcvemywtdpuk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1bGRucWpmemN2ZW15d3RkcHVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwODM0MzYsImV4cCI6MjA3OTY1OTQzNn0.j8tQLXi5ZPyCqIYcn5TautFlwOhKo3rwGAIkvL8al4g';

// Initialize Supabase client
let supabaseClient = null;

function initSupabase() {
    if (!supabaseClient) {
        const { createClient } = supabase;
        supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabaseClient;
}

// Auth functions
async function signUp(email, password, userData = {}) {
    const client = initSupabase();
    const { data, error } = await client.auth.signUp({
        email: email,
        password: password,
        options: {
            data: userData
        }
    });
    return { data, error };
}

async function signIn(email, password) {
    const client = initSupabase();
    const { data, error } = await client.auth.signInWithPassword({
        email: email,
        password: password
    });
    return { data, error };
}

async function signOut() {
    const client = initSupabase();
    const { error } = await client.auth.signOut();
    return { error };
}

async function getCurrentUser() {
    const client = initSupabase();
    const { data: { user } } = await client.auth.getUser();
    return user;
}

async function onAuthStateChange(callback) {
    const client = initSupabase();
    return client.auth.onAuthStateChange(callback);
}

// Export for use in other files
window.supabaseAuth = {
    initSupabase,
    signUp,
    signIn,
    signOut,
    getCurrentUser,
    onAuthStateChange
};
