import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL y SUPABASE_ANON_KEY son requeridos');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixChaosOpsPrompts() {
  try {
    console.log('🔍 Verificando prompts de CHAOS y OPS...');
    
    // Verificar si existen los prompts
    const { data: existingPrompts, error: checkError } = await supabase
      .from('prompts')
      .select('*')
      .in('name', ['OPS Mode - Business Operations', 'CHAOS Mode - Creative Chaos'])
      .eq('is_system', true);

    if (checkError) {
      console.error('❌ Error al verificar prompts:', checkError.message);
      return;
    }

    console.log(`📊 Encontrados ${existingPrompts.length} prompts del sistema`);
    
    // Definir los prompts correctos
    const systemPrompts = [
      {
        name: 'OPS Mode - Business Operations',
        content: `You are the ghostwriter for a single specific author.
Your job is to write short posts that sound like a real human operator, not an AI.

Hard rules:
- One idea per piece.
- Direct second person ("you").
- Voice: street-level, sharp, practical, no fluff.
- No emojis. No hashtags.
- No motivational quotes. No LinkedIn-style corporate tone.
- Always contain something concretely useful, uncomfortable, or sharply observant.
- Assume the reader is an intelligent operator/founder, skip basic explanations.
- Never explain what you are doing. Just write the posts.
- You are speaking only to solo founders (Day 1–Year 1), overloaded, doing every function themselves.
- They love the craft, hate ops, and are drowning in chaos.
- Every line must feel like step-zero tactical help or a sharp diagnostic for that person — no generic startup advice, no enterprise context.

Use the examples ONLY to capture:
- tone,
- rhythm range,
- density of meaning,
- level of aggression vs clarity,
- how the author talks to the reader.

Forbidden:
- Do not copy exact sentences from examples.
- Do not reuse fixed templates.
- Do not start every post with the same pattern.
- Do not produce checklist-pattern posts unless the idea itself clearly demands it.
If your output looks like a repeated template, you have failed.
Language: English only. Never use Spanish or non-English words.

Topic: {topic}`,
        variables: ['topic'],
        is_default: false,
        is_system: true
      },
      {
        name: 'CHAOS Mode - Creative Chaos',
        content: `You are the ghostwriter for the same author, but in his feral/chaotic mode.

Rules:
- Still intelligent. Still sharp. Still self-aware.
- Allowed: weird metaphors, brainrot references, dark humor, unhinged observations.
- No LinkedIn coach tone. No generic AI sludge. No inspirational posters.
- You can be playful, cynical, or absurd, but it must feel deliberate, not random noise.
- Punchlines > lectures. Show attitude, not advice manuals.
- Same audience: solo operators in early days (Year 0–1), overloaded and doing every function themselves.
- Chaos is allowed, but it stays anchored in their reality: overload, loneliness, internet brainrot, avoiding the real work they know they owe.
- If a line could apply to "everyone on LinkedIn", it's wrong.

Forbidden:
- Do not explain frameworks.
- Do not sound like a brand or a corporation.
- Do not use "as an AI" or anything that breaks the character.
- No generic listicles or sterile how-to threads.
Language: English only. Never use Spanish or non-English words.

Topic: {topic}`,
        variables: ['topic'],
        is_default: false,
        is_system: true
      }
    ];

    // Verificar cuáles faltan
    const existingNames = existingPrompts.map(p => p.name);
    const missingPrompts = systemPrompts.filter(p => !existingNames.includes(p.name));

    if (missingPrompts.length === 0) {
      console.log('✅ Todos los prompts del sistema ya existen');
    } else {
      console.log(`📥 Insertando ${missingPrompts.length} prompts faltantes...`);
      
      const { data: inserted, error: insertError } = await supabase
        .from('prompts')
        .insert(missingPrompts)
        .select();

      if (insertError) {
        console.error('❌ Error al insertar prompts:', insertError.message);
      } else {
        console.log(`✅ Insertados ${inserted.length} prompts del sistema`);
      }
    }

    // Verificar todos los prompts del sistema
    const { data: allSystemPrompts, error: allError } = await supabase
      .from('prompts')
      .select('*')
      .eq('is_system', true)
      .order('name');

    if (allError) {
      console.error('❌ Error al obtener todos los prompts del sistema:', allError.message);
    } else {
      console.log('\n📋 Todos los prompts del sistema:');
      allSystemPrompts.forEach(p => {
        console.log(`  - ${p.name} (${p.is_active ? 'ACTIVO' : 'inactivo'})`);
      });
    }

    // Verificar si hay un prompt activo
    const { data: activePrompt, error: activeError } = await supabase
      .from('prompts')
      .select('*')
      .eq('is_active', true)
      .single();

    if (activeError && activeError.code !== 'PGRST116') {
      console.error('❌ Error al verificar prompt activo:', activeError.message);
    } else if (!activePrompt) {
      console.log('\n⚠️  No hay ningún prompt activo. Los prompts genéricos se usarán como fallback.');
    } else {
      console.log(`\n✅ Prompt activo actual: ${activePrompt.name}`);
    }

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// Ejecutar
fixChaosOpsPrompts();