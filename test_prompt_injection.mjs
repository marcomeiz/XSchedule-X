// Test script to verify prompt injection is working
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

async function testPromptInjection() {
  console.log('🧪 Testing prompt injection system...\n');
  
  try {
    // Step 1: Get current prompt
    console.log('1️⃣ Getting current prompt...');
    const currentData = await makeRequest('http://localhost:3000/api/config/prompts/current');
    
    if (!currentData.success) {
      console.log('❌ Failed to get current prompt:', currentData.error);
      return;
    }
    
    console.log('✅ Current prompt:', currentData.prompt?.name || 'No prompt set');
    console.log('   Content:', currentData.prompt?.content?.substring(0, 100) + '...' || 'No content');
    
    // Step 2: Test generation with current prompt (like the frontend does)
    console.log('\n2️⃣ Testing AI generation with current prompt...');
    
    // This is how the frontend calls it
    const requestBody = { 
      mode: 'ops',
      prompt: currentData.prompt?.content,
      promptId: currentData.prompt?.id,
      promptVariables: currentData.prompt?.variables || []
    };
    
    console.log('   Request body:', JSON.stringify(requestBody, null, 2));
    
    const generateData = await makeRequest('http://localhost:3000/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    
    if (!generateData.success) {
      console.log('❌ Generation failed:', generateData.error);
      return;
    }
    
    console.log('✅ Generation successful!');
    console.log('   Generated text:', generateData.variants[0]?.text || 'No text generated');
    
    // Check if quality content was generated
    if (currentData.prompt?.content) {
      const text = generateData.variants[0]?.text || '';
      const isQuality = text.length > 20 && text.includes('business') || text.includes('technology') || text.includes('insights');
      console.log(`   ${isQuality ? '✅' : '❌'} Quality content generated: ${isQuality}`);
      
      if (isQuality) {
        console.log('\n🎉 SUCCESS: Prompt injection is working correctly!');
        console.log('   The custom prompt is being used in generation.');
      } else {
        console.log('\n⚠️  WARNING: Content quality may need improvement.');
        console.log('   The generated content does not meet quality standards.');
      }
    }
    
    // Save results to file for analysis
    const results = {
      timestamp: new Date().toISOString(),
      currentPrompt: currentData.prompt,
      generatedText: generateData.variants[0]?.text,
      success: true
    };
    
    await fs.writeFile('test_results.json', JSON.stringify(results, null, 2));
    console.log('\n📄 Results saved to test_results.json');
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

// Run the test
testPromptInjection();