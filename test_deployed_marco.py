#!/usr/bin/env python3
"""
Test the deployed Marco Voice Engine with custom prompts.
"""

import requests
import json

def test_deployed_marco():
    print("🧪 Testing Deployed Marco Voice Engine")
    print("=" * 50)
    
    base_url = "https://marco-voice-engine.fly.dev"
    
    # Test 1: Health check
    print("\n1️⃣ Health check...")
    try:
        response = requests.get(f"{base_url}/health")
        if response.status_code == 200:
            print("✅ Marco Voice Engine is healthy")
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health check error: {e}")
        return False
    
    # Test 2: Custom prompt generation
    print("\n2️⃣ Testing custom prompt generation...")
    custom_prompt = "Generate professional tweets about business and technology topics. Focus on providing valuable insights and actionable advice."
    
    try:
        response = requests.post(
            f"{base_url}/generate",
            json={"mode": "ops", "prompt": custom_prompt},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Generation successful!")
            print(f"Topic: {data.get('topic')}")
            print(f"Received {len(data.get('variants', []))} variants:")
            
            quality_found = False
            for i, variant in enumerate(data.get('variants', [])):
                text = variant.get('text', '')
                score = variant.get('score', 0)
                print(f"Variant {i+1} (score: {score}): {text}")
                # Check for quality indicators
                if len(text) > 20 and any(word in text.lower() for word in ['business', 'technology', 'insights', 'professional']):
                    quality_found = True
                    print(f"✅ Quality content found in variant {i+1}!")
            
            if quality_found:
                print("\n🎉 SUCCESS: Custom prompt injection working!")
                return True
            else:
                print("❌ No quality content found in variants")
                return False
        else:
            print(f"❌ Generation failed: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Generation error: {e}")
        return False

if __name__ == "__main__":
    success = test_deployed_marco()
    if not success:
        print("\n❌ FAILED: Custom prompt injection not working on deployed version")
        exit(1)
    else:
        print("\n✅ All tests passed!")