# Fix: Gemini API Key Missing Error

## Problem
You're seeing this error:
```
Gemini AI is required for assessment calculation. 
Please ensure GEMINI_API_KEY is configured.
```

This means the `GEMINI_API_KEY` environment variable is not set in your Render deployment.

## Solution: Add Environment Variable in Render

### Step 1: Get Your Gemini API Key

If you don't have a Gemini API key yet:

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy the generated API key (starts with `AIza...`)

### Step 2: Add to Render Dashboard

1. **Go to Render Dashboard:**
   - Visit: https://dashboard.render.com
   - Sign in to your account

2. **Navigate to Your Service:**
   - Click on **"spotsmart-assessment"** (or your service name)
   - Or find it in the **Services** list

3. **Open Environment Tab:**
   - Click on **"Environment"** in the left sidebar
   - Or scroll down to the **Environment Variables** section

4. **Add the API Key:**
   - Click **"Add Environment Variable"** or **"Add Secret"**
   - **Key**: `GEMINI_API_KEY`
   - **Value**: Paste your Gemini API key (from Step 1)
   - Click **"Save Changes"**

5. **Redeploy:**
   - Go to **"Manual Deploy"** tab
   - Click **"Deploy latest commit"**
   - Wait 2-5 minutes for deployment to complete

### Step 3: Verify It Works

1. Visit your app: `https://spotsmart-assessment.onrender.com`
2. Try submitting a prospect assessment
3. The error should be gone!

## Alternative: Using Render CLI

If you have Render CLI installed:

```bash
# Set the environment variable
render env:set GEMINI_API_KEY=your_api_key_here --service spotsmart-assessment

# Or if using render.yaml
render env:sync --service spotsmart-assessment
```

## Troubleshooting

### Still Getting the Error?

1. **Check the variable name:**
   - Must be exactly: `GEMINI_API_KEY` (case-sensitive)

2. **Verify the API key:**
   - Make sure it starts with `AIza...`
   - No extra spaces or quotes

3. **Check deployment logs:**
   - In Render dashboard → **Logs** tab
   - Look for: `✅ Gemini AI initialized successfully`
   - If you see warnings, the key might be invalid

4. **Wait for deployment:**
   - After adding the variable, wait for the service to redeploy
   - Check **Events** tab to see deployment status

### Test API Key Locally

To verify your API key works:

```bash
# In your project directory
export GEMINI_API_KEY=your_api_key_here
node -e "const {GoogleGenerativeAI} = require('@google/generative-ai'); const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); const model = genAI.getGenerativeModel({model: 'gemini-2.5-flash'}); model.generateContent('Hi').then(r => console.log('✅ API Key works!')).catch(e => console.error('❌ Error:', e.message));"
```

## Security Note

- **Never commit your API key to Git**
- The key is stored securely in Render's environment variables
- It's encrypted and only accessible to your service

## Need Help?

- Check Render docs: https://render.com/docs/environment-variables
- Check server logs in Render dashboard for more details
