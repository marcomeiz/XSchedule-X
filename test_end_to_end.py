#!/usr/bin/env python3
"""
Test script to verify end-to-end custom prompt flow through XSchedule-X
"""

import requests
import json

def test_xschedule_custom_prompt():
    """Test custom prompt injection through XSchedule-X"""
    
    # First, let's create a custom prompt in XSchedule-X
    custom_prompt_content = """
    You are a social media expert. Generate engaging tweets about the topic provided.
    The tweets should be relevant, informative, and capture audience attention.
    Focus on creating valuable content that resonates with your audience.
    """
    
    print("Step 1: Creating custom prompt in XSchedule-X...")
    
    # Create a new prompt
    prompt_data = {
        "name": "Professional Social Media Prompt",
        "content": custom_prompt_content.strip(),
        "variables": ["topic"]
    }
    
    try:
        # Create the prompt
        response = requests.post(
            "http://localhost:3000/api/config/prompts",
            json=prompt_data,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            print("✅ Custom prompt created successfully")
            prompt_result = response.json()
            prompt_id = prompt_result.get('prompt', {}).get('id')
            print(f"Prompt ID: {prompt_id}")
        else:
            print(f"❌ Failed to create prompt: {response.text}")
            return
            
    except Exception as e:
        print(f"❌ Error creating prompt: {e}")
        return
    
    print("\nStep 2: Setting the custom prompt as current...")
    
    try:
        # Set it as current prompt
        response = requests.post(
            f"http://localhost:3000/api/config/prompts/{prompt_id}/set-current",
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            print("✅ Custom prompt set as current")
        else:
            print(f"❌ Failed to set prompt as current: {response.text}")
            
    except Exception as e:
        print(f"❌ Error setting current prompt: {e}")
    
    print("\nStep 3: Verifying current prompt...")
    
    try:
        # Verify current prompt
        response = requests.get("http://localhost:3000/api/config/prompts/current")
        
        if response.status_code == 200:
            current_data = response.json()
            if current_data.get('success') and current_data.get('prompt'):
                current_prompt = current_data['prompt']['content']
                print(f"✅ Current prompt verified: {current_prompt[:100]}...")
                
                # Check if it contains professional content
                if 'social media expert' in current_prompt.lower():
                    print("✅ Custom prompt contains professional social media requirements")
                else:
                    print("❌ Custom prompt doesn't contain expected professional requirements")
            else:
                print("❌ No current prompt found")
        else:
            print(f"❌ Failed to get current prompt: {response.text}")
            
    except Exception as e:
        print(f"❌ Error verifying current prompt: {e}")
    
    print("\nStep 4: Testing AI generation with custom prompt...")
    
    # Test AI generation
    generation_data = {
        "mode": "ops",
        "topic": "La inteligencia artificial en el mundo moderno"
    }
    
    try:
        response = requests.post(
            "http://localhost:3000/api/generate",
            json=generation_data,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Generation successful!")
            print(f"Received {len(result.get('variants', []))} variants")
            
            # Check if variants contain quality content
            quality_variants = []
            for i, variant in enumerate(result.get('variants', [])):
                text = variant.get('text', '')
                # Check for quality indicators (length, engagement, relevance)
                if len(text) > 20 and any(word in text.lower() for word in ['inteligencia', 'artificial', 'tecnología', 'futuro']):
                    quality_variants.append((i, text))
                print(f"Variant {i+1}: {text}")
                print(f"Score: {variant.get('score', 'N/A')}")
                print("---")
            
            if quality_variants:
                print(f"🎉 SUCCESS! Found {len(quality_variants)} quality variants about AI:")
                for idx, text in quality_variants:
                    print(f"  Variant {idx+1}: {text}")
                return True
            else:
                print("❌ No quality variants found - content generation may need adjustment")
                return False
        else:
            print(f"❌ Generation failed: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error during generation: {e}")
        return False

if __name__ == "__main__":
    success = test_xschedule_custom_prompt()
    if success:
        print("\n🎉 END-TO-END TEST PASSED! Custom prompt injection is working correctly.")
    else:
        print("\n❌ END-TO-END TEST FAILED! Custom prompt injection needs debugging.")