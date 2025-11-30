
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ykaakergiurczsssaetc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrYWFrZXJnaXVyY3pzc3NhZXRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxMjE0NDYsImV4cCI6MjA3OTY5NzQ0Nn0.d22pRyBXvfYTi7gj1UuaixmlhIOL0yWPW4f3GKk-ZbI';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
