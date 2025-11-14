import dotenv from 'dotenv';

dotenv.config();

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

const chaosOpsPrompts = [
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
    is_system: true,
    is_default: false
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
    is_system: true,
    is_default: false
  }
];

async function createChaosOpsPrompts() {
  console.log('🚀 Creando prompts de CHAOS y OPS en el servidor...');
  
  for (const prompt of chaosOpsPrompts) {
    try {
      console.log(`📄 Creando prompt: ${prompt.name}...`);
      
      const response = await fetch(`${SERVER_URL}/api/config/prompts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(prompt),
      });

      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ Prompt creado: ${prompt.name}`);
      } else {
        console.error(`❌ Error al crear ${prompt.name}:`, result.error);
      }
      
      // Pequeña pausa entre creaciones
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ Error de red al crear ${prompt.name}:`, error.message);
    }
  }
  
  console.log('🎉 Proceso completado. Verificando prompts creados...');
  
  // Verificar todos los prompts
  try {
    const response = await fetch(`${SERVER_URL}/api/config/prompts`);
    const result = await response.json();
    
    if (result.success && result.prompts) {
      console.log('\n📋 Todos los prompts disponibles:');
      const prompts = Object.values(result.prompts);
      prompts.forEach(p => {
        console.log(`  - ${p.name} (sistema: ${p.is_system || false})`);
      });
      
      // Verificar si nuestros prompts específicos existen
      const opsPrompt = prompts.find(p => p.name === 'OPS Mode - Business Operations');
      const chaosPrompt = prompts.find(p => p.name === 'CHAOS Mode - Creative Chaos');
      
      if (opsPrompt && chaosPrompt) {
        console.log('\n🎉 ✨ ÉXITO: Ambos prompts de CHAOS y OPS están creados y disponibles!');
        
        // Probar uno de los prompts
        console.log('\n🧪 Probando prompt OPS...');
        await testPrompt('ops', 'business operations');
        
        console.log('\n🧪 Probando prompt CHAOS...');
        await testPrompt('chaos', 'creative thinking');
        
      } else {
        console.log('\n⚠️  Algunos prompts no se crearon correctamente');
        if (!opsPrompt) console.log('  ❌ Falta: OPS Mode - Business Operations');
        if (!chaosPrompt) console.log('  ❌ Falta: CHAOS Mode - Creative Chaos');
      }
    }
    
  } catch (error) {
    console.error('❌ Error al verificar prompts:', error.message);
  }
}

async function testPrompt(mode, topic) {
  try {
    const response = await fetch(`${SERVER_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: topic,
        mode: mode,
        count: 1
      }),
    });

    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Generación con modo ${mode} exitosa`);
      console.log(`📄 Contenido: ${result.content[0].substring(0, 100)}...`);
    } else {
      console.error(`❌ Error en generación ${mode}:`, result.error);
    }
    
  } catch (error) {
    console.error(`❌ Error de red al probar ${mode}:`, error.message);
  }
}

// Ejecutar
createChaosOpsPrompts();