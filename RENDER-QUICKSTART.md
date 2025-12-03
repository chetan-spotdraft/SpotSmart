# Render Deployment - Quick Start

## ✅ Yes, You Can Deploy to Render!

Render is perfect for your Express + Node.js app. **No timeout limits** (unlike Netlify's 10s limit).

## Quick Deploy (3 Steps)

### 1. Push to GitHub
```bash
git add .
git commit -m "Ready for Render"
git push origin main
```

### 2. Deploy on Render
- Go to [render.com](https://render.com) → Sign up/Login
- Click **"New +"** → **"Blueprint"**
- Connect your GitHub repo
- Render will auto-detect `render.yaml`
- Click **"Apply"**

### 3. Set Environment Variable
- Go to your service → **Environment**
- Add: `GEMINI_API_KEY` = your API key
- Save

**Done!** Your app will be live at `https://your-service.onrender.com`

## Manual Setup (Alternative)

1. **New +** → **Web Service**
2. Connect GitHub repo
3. Settings:
   - **Build**: `npm install`
   - **Start**: `npm start`
   - **Health Check**: `/health`
4. Add `GEMINI_API_KEY` environment variable
5. Deploy!

## Advantages Over Netlify

✅ **No timeout limits** (Netlify: 10s free / 26s pro)  
✅ **Full Express server** (not serverless functions)  
✅ **750 hours/month free** (enough for always-on)  
✅ **Automatic HTTPS**  
✅ **Easy environment variables**

## Free Tier Note

- Services sleep after 15 min inactivity
- First request after sleep: ~30s wake-up time
- **Upgrade to Starter ($7/mo)** for no sleep

## Full Guide

See `RENDER-DEPLOY.md` for detailed instructions.

