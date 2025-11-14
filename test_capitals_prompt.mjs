// Test script to create and test a new prompt
import { promises as fs } from 'fs';

async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { success: false, error: text };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testNewPrompt() {
  console.log('🧪 Testing new prompt: Always end with word in CAPITALS...\n');
  
  try {
    // Step 1: Create a new prompt that always ends with a word in CAPITALS
    console.log('1️⃣ Creating new prompt...');
    const promptData = {
      name: 'End with CAPITALS Test',
      content: 'Generate tweets about the topic. Always end the tweet with a single word completely in CAPITAL letters.',
      variables: ['topic'],
      is_active: true
    };
    
    const saveResponse = await makeRequest('http://localhost:3000/api/config/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(promptData)
    });
    
    if (!saveResponse.success) {
      console.log('❌ Failed to save prompt:', saveResponse.error);
      return;
    }
    
    console.log('✅ Prompt saved:', saveResponse.prompt.name);
    
    // Step 2: Test generation with the new prompt
    console.log('\n2️⃣ Testing generation with new prompt...');
    
    // Test multiple times to ensure consistency
    for (let i = 0; i < 3; i++) {
      console.log(`\n   Test ${i + 1}:`);
      
      const generateResponse = await makeRequest('http://localhost:3000/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'ops',
          prompt: promptData.content,
          promptId: saveResponse.prompt.id,
          promptVariables: promptData.variables
        })
      });
      
      if (!generateResponse.success) {
        console.log('   ❌ Generation failed:', generateResponse.error);
        continue;
      }
      
      const text = generateResponse.variants[0]?.text || '';
      console.log('   Generated:', text);
      
      // Check if it ends with a word in CAPITALS
      const words = text.trim().split(' ');
      const lastWord = words[words.length - 1];
      const hasCapitalEnding = lastWord === lastWord.toUpperCase() && lastWord.length > 1;
      
      console.log(`   ${hasCapitalEnding ? '✅' : '❌'} Ends with CAPITALS: ${lastWord}`);
    }
    
    console.log('\n🎉 Test completed!');
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

// Run the test
testNewPrompt();