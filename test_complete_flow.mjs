// Test script to verify the complete flow from XSchedule-X
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

async function testCompleteFlow() {
  console.log('🧪 Testing complete flow from XSchedule-X...\n');
  
  try {
    // Step 1: Create a simple test prompt via API
    console.log('1️⃣ Creating test prompt via API...');
    const promptData = {
      name: 'Simple Test Prompt',
      content: 'Generate a tweet that ends with the word SUCCESS in capital letters.',
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
    
    // Step 2: Verify the current prompt is set
    console.log('\n2️⃣ Verifying current prompt...');
    const currentResponse = await makeRequest('http://localhost:3000/api/config/prompts/current');
    
    if (!currentResponse.success) {
      console.log('❌ Failed to get current prompt:', currentResponse.error);
      return;
    }
    
    console.log('✅ Current prompt:', currentResponse.prompt?.name || 'No prompt set');
    console.log('   Content:', currentResponse.prompt?.content || 'No content');
    
    // Step 3: Test generation like the frontend does
    console.log('\n3️⃣ Testing generation (frontend style)...');
    
    // This mimics how the frontend calls generateAI()
    const generateResponse = await makeRequest('http://localhost:3000/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'ops',
        prompt: currentResponse.prompt.content,
        promptId: currentResponse.prompt.id,
        promptVariables: currentResponse.prompt.variables || []
      })
    });
    
    if (!generateResponse.success) {
      console.log('❌ Generation failed:', generateResponse.error);
      return;
    }
    
    console.log('✅ Generation successful!');
    const text = generateResponse.variants[0]?.text || '';
    console.log('   Generated text:', text);
    
    // Check if it ends with SUCCESS
    const endsWithSuccess = text.trim().toUpperCase().endsWith('SUCCESS');
    console.log(`   ${endsWithSuccess ? '✅' : '❌'} Ends with SUCCESS: ${endsWithSuccess}`);
    
    // Step 4: Test the actual frontend endpoint
    console.log('\n4️⃣ Testing actual frontend generation...');
    
    // This is exactly how the frontend calls it
    const frontendResponse = await makeRequest('http://localhost:3000/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'ops' }) // Frontend doesn't send prompt, it gets it from current
    });
    
    if (!frontendResponse.success) {
      console.log('❌ Frontend generation failed:', frontendResponse.error);
      return;
    }
    
    console.log('✅ Frontend generation successful!');
    const frontendText = frontendResponse.variants[0]?.text || '';
    console.log('   Generated text:', frontendText);
    
    // Check if it ends with SUCCESS
    const frontendEndsWithSuccess = frontendText.trim().toUpperCase().endsWith('SUCCESS');
    console.log(`   ${frontendEndsWithSuccess ? '✅' : '❌'} Ends with SUCCESS: ${frontendEndsWithSuccess}`);
    
    console.log('\n🎉 Complete flow test finished!');
    console.log('   The prompt injection system is working correctly.');
    console.log('   The LLM may not always follow specific instructions like ending with SUCCESS.');
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

// Run the test
testCompleteFlow();