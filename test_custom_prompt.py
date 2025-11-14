#!/usr/bin/env python3
"""
Test script to verify that Marco Voice Engine accepts custom prompts.
"""

import requests
import json

def test_custom_prompt():
    """Test that custom prompts are accepted and used."""
    
    # Test with custom prompt
    custom_prompt = "Generate professional business content that is engaging and informative. Focus on practical insights and actionable advice."
    
    payload = {
        "mode": "ops",
        "prompt": custom_prompt
    }
    
    print("Testing custom prompt...")
    print(f"Custom prompt: {custom_prompt}")
    
    try:
        response = requests.post(
            "https://marco-voice-engine.fly.dev/generate",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Success! Response: {json.dumps(result, indent=2)}")
            
            # Check if the content includes our requirements
            variants = result.get("variants", [])
            for i, variant in enumerate(variants):
                text = variant.get("text", "")
                print(f"\nVariant {i+1}: {text}")
                print(f"Is professional: {len(text) > 20 and any(word in text.lower() for word in ['business', 'professional', 'insights'])}")
                print(f"Is well-formatted: {not text.isupper() and len(text) > 10}")
                
        else:
            print(f"❌ Error: {response.status_code} - {response.text}")
            
    except Exception as e:
        print(f"❌ Exception: {e}")

def test_default_prompt():
    """Test that default prompts still work."""
    
    payload = {
        "mode": "ops"
    }
    
    print("\n\nTesting default prompt (no custom prompt)...")
    
    try:
        response = requests.post(
            "https://marco-voice-engine.fly.dev/generate",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Success! Response: {json.dumps(result, indent=2)}")
            
            # Check if the content is professional and well-formatted
            variants = result.get("variants", [])
            for i, variant in enumerate(variants):
                text = variant.get("text", "")
                print(f"\nVariant {i+1}: {text}")
                print(f"Is professional: {len(text) > 20 and any(word in text.lower() for word in ['business', 'professional', 'insights'])}")
                print(f"Is well-formatted: {not text.isupper() and len(text) > 10}")
                
        else:
            print(f"❌ Error: {response.status_code} - {response.text}")
            
    except Exception as e:
        print(f"❌ Exception: {e}")

if __name__ == "__main__":
    test_custom_prompt()
    test_default_prompt()