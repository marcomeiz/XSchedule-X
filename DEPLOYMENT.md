# XSchedule-X Deployment Guide

## 🚀 Production Deployment Options

### Option 1: Vercel (Recommended)

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy to Vercel**:
   ```bash
   cd /Users/marcomeipersonal/Desktop/MMEI/Proyectos\ Personales/00xandbot/repos/XSchedule-X
   vercel --prod
   ```

4. **Set Environment Variables**:
   ```bash
   vercel env add TWITTER_API_KEY production
   vercel env add TWITTER_API_SECRET production
   vercel env add TWITTER_ACCESS_TOKEN production
   vercel env add TWITTER_ACCESS_SECRET production
   vercel env add TWITTER_BEARER_TOKEN production
   vercel env add SUPABASE_URL production
   vercel env add SUPABASE_ANON_KEY production
   ```

### Option 2: Fly.io

1. **Install Fly CLI**:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login to Fly**:
   ```bash
   fly auth login
   ```

3. **Deploy to Fly**:
   ```bash
   cd /Users/marcomeipersonal/Desktop/MMEI/Proyectos\ Personales/00xandbot/repos/XSchedule-X
   fly deploy
   ```

4. **Set Environment Variables**:
   ```bash
   fly secrets set TWITTER_API_KEY=your_key_here
   fly secrets set TWITTER_API_SECRET=your_secret_here
   # ... set other secrets
   ```

### Option 3: Render

1. **Connect GitHub Repository** to Render
2. **Use the provided `render.yaml` configuration**
3. **Set Environment Variables** in Render dashboard

## 🔧 Configuration System Features

The deployed application includes a comprehensive configuration system with:

### Prompt Management
- Rich text editor with variable detection (`{{variable}}`)
- Versioning system with change history
- Preset management for different prompt types
- Create, edit, delete, and organize prompts

### LLM Configuration
- Provider selection (OpenRouter, OpenAI, Anthropic)
- Model dropdown with popular options
- Parameter controls (temperature, top_p, max_tokens)
- Preset saving/loading for different configurations

### API Configuration
- Twitter API credentials management
- Supabase configuration with secure inputs
- Environment variable integration
- Real-time validation and testing

### Application Settings
- Auto-save functionality with configurable intervals
- Content length limits and quality thresholds
- Theme and language preferences
- Notification preferences

### Advanced Features
- **Auto-save System**: Configurable auto-save with debounced updates
- **Unsaved Changes Warning**: Visual notification with save/discard options
- **Notification System**: Toast notifications for user feedback
- **Import/Export**: Full configuration backup and restore functionality
- **Variable Detection**: Automatic detection of `{{variables}}` in prompts
- **Apple Liquid Glass Design**: Modern, clean interface with glassmorphism effects

## 🔐 Environment Variables Required

```bash
# Twitter/X API Credentials
TWITTER_API_KEY=your_api_key_here
TWITTER_API_SECRET=your_api_secret_here
TWITTER_ACCESS_TOKEN=your_access_token_here
TWITTER_ACCESS_SECRET=your_access_secret_here
TWITTER_BEARER_TOKEN=your_bearer_token_here

# Supabase Configuration (Optional)
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_KEY=your_supabase_service_key_here

# Server Configuration
PORT=3000
NODE_ENV=production
```

## 🧪 Testing the Configuration System

After deployment, test the configuration system:

1. **Access Configuration**: Navigate to `/` and click the Configuration tab
2. **Test Prompt Management**: Create a new prompt with variables
3. **Test LLM Settings**: Adjust temperature and model settings
4. **Test Import/Export**: Export configuration, modify it, then import
5. **Test Auto-save**: Enable auto-save and make changes

## 📱 API Endpoints

The configuration system provides these REST API endpoints:

- `GET /api/config` - Retrieve complete configuration
- `POST /api/config` - Update configuration
- `GET /api/config/:section` - Get specific configuration section
- `GET /api/config/status` - Check for unsaved changes
- `GET /api/config/export` - Export configuration as JSON
- `POST /api/config/import` - Import configuration from JSON
- `POST /api/config/reset` - Reset to default values
- `POST /api/config/prompts` - Create/update prompts
- `GET /api/config/prompts/history` - Get prompt history

## 🎯 Next Steps

1. **Set up your Twitter/X API credentials**
2. **Configure your preferred LLM provider**
3. **Create custom prompts for your content generation**
4. **Test the auto-scheduling functionality**
5. **Monitor the application logs for any issues**

## 📞 Support

If you encounter any issues during deployment:

1. Check the application logs
2. Verify all environment variables are set correctly
3. Ensure your API credentials have proper permissions
4. Test the configuration system locally first

The configuration system is now ready for production use with comprehensive features for managing prompts, LLM settings, API credentials, and application behavior through an intuitive interface with real-time validation and auto-save functionality.