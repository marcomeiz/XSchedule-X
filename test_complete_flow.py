#!/usr/bin/env python3
"""
Test script to verify the complete prompt injection flow works end-to-end.
"""

import requests
import json

def test_complete_flow():
    print("🧪 Testing Complete Prompt Injection Flow")
    print("=" * 50)
    
    # Step 1: Check current prompt
    print("\n1️⃣ Checking current prompt...")
    try:
        response = requests.get("http://localhost:3000/api/config/prompts/current")
        prompt_data = response.json()
        print(f"✅ Current prompt endpoint working: {prompt_data.get('success')}")
        
        if prompt_data.get('success') and prompt_data.get('prompt'):
            current_prompt = prompt_data['prompt']['content']
            print(f"📄 Current prompt: {current_prompt}")
            print(f"🔍 Contains professional content: {'social media' in current_prompt.lower() or 'business' in current_prompt.lower()}")
        else:
            print("❌ No current prompt found")
            return False
            
    except Exception as e:
        print(f"❌ Error checking current prompt: {e}")
        return False
    
    # Step 2: Test generation through XSchedule-X proxy
    print("\n2️⃣ Testing generation through XSchedule-X...")
    try:
        response = requests.post(
            "http://localhost:3000/api/generate",
            json={"mode": "ops"},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Generation successful, received {len(data.get('variants', []))} variants")
            
            # Check if quality content appears in any variant
            variants = data.get('variants', [])
            quality_found = False
            for i, variant in enumerate(variants):
                text = variant.get('text', '')
                print(f"Variant {i+1}: {text}")
                # Check for quality indicators
                if len(text) > 20 and any(word in text.lower() for word in ['business', 'technology', 'professional', 'insights']):
                    quality_found = True
                    print(f"✅ Quality content found in variant {i+1}!")
            
            if not quality_found:
                print("❌ No quality content found in any variant")
                return False
                
        else:
            print(f"❌ Generation failed: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error during generation: {e}")
        return False
    
    print("\n🎉 SUCCESS: Complete prompt injection flow working!")
    return True

if __name__ == "__main__":
    success = test_complete_flow()
    exit(0 if success else 1)