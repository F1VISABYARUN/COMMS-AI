import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

// We use process.env first, but fallback to the keys you provided so it works out of the box locally.
const supabaseUrl = process.env.SUPABASE_URL || 'https://rspbyqiqshfybjcqlwcy.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzcGJ5cWlxc2hmeWJqY3Fsd2N5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDkzMTQ3MSwiZXhwIjoyMDk2NTA3NDcxfQ.x2kRZ4siSJ_JVaheEbkcE-sGaH7Yxi4KeoWhRD4VawI';

if (!supabaseUrl || !supabaseKey) {
  console.warn('[WARN] Missing Supabase environment variables. Database operations may fail.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
