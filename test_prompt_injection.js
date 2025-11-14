// Test script to verify prompt injection is working
const http = require('http');
const https = require('https');

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    const req = protocol.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function testPromptInjection() {
  console.log('🧪 Testing prompt injection system...\n');
  
  try {
    // Step 1: Get current prompt
    console.log('1️⃣ Getting current prompt...');
    const currentData = await makeRequest('http://localhost:3000/api/config/prompts/current');
    
    if (!currentData.success) {
      console.log('❌ Failed to get current prompt');
      return;
    }
    
    console.log('✅ Current prompt:', currentData.prompt?.name || 'No prompt set');
    console.log('   Content:', currentData.prompt?.content?.substring(0, 100) + '...' || 'No content');
    
    // Step 2: Test generation with current prompt
    console.log('\n2️⃣ Testing AI generation with current prompt...');
    const generateData = await makeRequest('http://localhost:3000/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'ops',
        topic: 'artificial intelligence'
      })
    });
    
    if (!generateData.success) {
      console.log('❌ Generation failed:', generateData.error);
      return;
    }
    
    console.log('✅ Generation successful!');
    console.log('   Generated text:', generateData.variants[0]?.text || 'No text generated');
    
    // Check if the prompt generates quality content
    if (currentData.prompt?.content) {
      const text = generateData.variants[0]?.text || '';
      const isQuality = text.length > 20 && text.includes('artificial intelligence');
      console.log(`   ${isQuality ? '✅' : '❌'} Quality content generated: ${isQuality}`);
    }
    
    console.log('\n🎉 Test completed successfully!');
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

// Run the test
testPromptInjection();