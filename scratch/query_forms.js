import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envText = fs.readFileSync('.env', 'utf-8');
const env = {};
envText.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('forms_library')
    .select('id, name, file_name, campus, degree_level, is_active')
    .order('campus');

  if (error) {
    console.error('Error fetching forms:', error);
    return;
  }

  console.log('--- FORMS LIBRARY ---');
  data.forEach((f) => {
    console.log(`- ID: ${f.id} | Name: ${f.name} | File: ${f.file_name} | Campus: ${f.campus} | Degree: ${f.degree_level} | Active: ${f.is_active}`);
  });
}

run();
