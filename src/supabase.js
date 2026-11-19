
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qdswkigbwbngrtswlzke.supabase.co';

const supabaseAnonKey = 'sb_publishable_-wss2VSfixyWN7OCYHOlgg_IU4axIxm';

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);
