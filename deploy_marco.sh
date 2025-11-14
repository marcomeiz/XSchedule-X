#!/bin/bash
# Deploy Marco Voice Engine with custom prompt support

echo "Deploying Marco Voice Engine with custom prompt support..."

# Change to the correct directory
cd /Users/marcomeipersonal/Desktop/MMEI/Proyectos Personales/00xandbot/repos/00001bot/marco-voice-engine

# Deploy to Fly.io
flyctl deploy --app marco-voice-engine

echo "Deployment complete!"