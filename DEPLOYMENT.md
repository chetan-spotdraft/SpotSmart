# Deployment Guide for SpotSmart Assessment

This guide covers deploying the SpotSmart Implementation Readiness Assessment to production.

## Architecture Overview

The application consists of:
- **Frontend**: Static HTML file (`spotsmart-complete.html`)
- **Backend**: Node.js/Express API server (`server.js`)

Both are served from the same Express server, making deployment simple.

## Recommended: Deploy to Render (All-in-One)

This is the simplest approach - everything runs on Render as a single web service.

### Step 1: Prepare Your Code

1. **Ensure all files are committed to Git:**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

### Step 2: Deploy to Render

**Option A: One-Click Deploy (Using render.yaml) - Recommended**

1. **In Render Dashboard:**
   - Go to [render.com](https://render.com) → Sign up/Login
   - Click **"New +"** → **"Blueprint"**
   - Connect your GitHub/GitLab/Bitbucket repository
   - Render will automatically detect `render.yaml`
   - Click **"Apply"**

2. **Set Environment Variables:**
   - Go to your service → **Environment** tab
   - Add: `GEMINI_API_KEY` = your Gemini API key
   - Add: `NODE_ENV` = `production` (optional)
   - Render automatically sets `PORT`

3. **Deploy:**
   - Click **"Manual Deploy"** → **"Deploy latest commit"**
   - Wait for deployment (usually 2-5 minutes)

4. **Your app will be live at:**
   - `https://your-service-name.onrender.com`
   - Or custom domain if configured

**Option B: Manual Setup**

1. **In Render Dashboard:**
   - Click **"New +"** → **"Web Service"**
   - Connect your Git repository

2. **Configure Service:**
   - **Name**: `spotsmart-assessment` (or your choice)
   - **Environment**: `Node`
   - **Region**: Choose closest to your users
   - **Branch**: `main` (or your default branch)
   - **Root Directory**: `.` (root of repo)

3. **Build & Start Commands:**
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

4. **Environment Variables:**
   - Click **"Environment"** tab
   - Add:
     - `GEMINI_API_KEY` = your Gemini API key
     - `NODE_ENV` = `production` (optional)
     - `PORT` = `10000` (Render sets this automatically, but this is a fallback)

5. **Advanced Settings:**
   - **Health Check Path**: `/health`
   - **Auto-Deploy**: `Yes` (deploys on every push to main branch)

6. **Deploy:**
   - Click **"Create Web Service"**
   - Wait for first deployment (2-5 minutes)

### Step 3: Verify Deployment

1. **Check Health Endpoint:**
   ```
   https://your-service.onrender.com/health
   ```
   Should return: `{"status":"ok","gemini_available":true,...}`

2. **Test Main App:**
   ```
   https://your-service.onrender.com/
   ```
   Should show the assessment form

3. **Test API:**
   ```bash
   curl -X POST https://your-service.onrender.com/assess \
     -H "Content-Type: application/json" \
     -d '{"intake_responses": {}}'
   ```

## Alternative: Separate Frontend & Backend

If you prefer to separate frontend and backend:

### Backend (Render/Railway)

1. Deploy `server.js` as a web service (same as above)
2. Get your backend URL (e.g., `https://spotsmart-api.onrender.com`)

### Frontend (Static Hosting)

1. **Update API URL in HTML:**
   - Open `spotsmart-complete.html`
   - Find `API_CONFIG` (around line 1784)
   - Update `BASE_URL` to your backend URL:
     ```javascript
     BASE_URL: 'https://your-backend.onrender.com'
     ```

2. **Deploy Frontend:**
   - **Vercel**: Drag & drop or connect GitHub
   - **GitHub Pages**: Push to `gh-pages` branch
   - **Cloudflare Pages**: Connect GitHub repo
   - **Any static host**: Upload `spotsmart-complete.html`

## Render Free Tier

- ✅ **750 hours/month** (enough for always-on service)
- ✅ **512 MB RAM**
- ✅ **No timeout limits** (unlike Netlify's 10s limit)
- ✅ **Automatic HTTPS**
- ⚠️ **Services sleep after 15 minutes of inactivity** (wake up on first request, ~30s delay)

### Upgrade Options

- **Starter Plan ($7/month)**: No sleep, better performance
- **Standard Plan ($25/month)**: More resources, better for production

## Environment Variables

### Required
- `GEMINI_API_KEY` - Your Google Gemini API key (get from [Google AI Studio](https://makersuite.google.com/app/apikey))

### Optional
- `PORT` - Server port (Render sets this automatically)
- `NODE_ENV` - Set to `production` for production deployments

## Custom Domain

1. Go to your service → **Settings** → **Custom Domains**
2. Add your domain
3. Follow DNS configuration instructions
4. Render provides free SSL certificates automatically

## Troubleshooting

### Service Won't Start

1. **Check Build Logs:**
   - Go to service → **Logs** tab
   - Look for errors during `npm install` or `npm start`

2. **Common Issues:**
   - **Port binding**: Render sets `PORT` automatically, your code should use `process.env.PORT`
   - **Missing dependencies**: Check `package.json` includes all required packages
   - **Environment variables**: Ensure `GEMINI_API_KEY` is set

### Service Sleeps (Free Tier)

- **First request after sleep**: Takes ~30 seconds to wake up
- **Solution**: Upgrade to Starter plan ($7/month) for no sleep
- **Or**: Use a cron job to ping your service every 10 minutes

### CORS Issues

- The server already includes CORS middleware
- If issues persist, check that requests are going to the correct URL

### API Not Working

1. **Check Environment Variables:**
   - Service → **Environment** tab
   - Verify `GEMINI_API_KEY` is set correctly

2. **Check Logs:**
   - Service → **Logs** tab
   - Look for error messages

3. **Test Health Endpoint:**
   ```bash
   curl https://your-service.onrender.com/health
   ```

## Quick Reference

### Files Needed
- ✅ `server.js` - Express server (serves both API and frontend)
- ✅ `package.json` - Dependencies
- ✅ `spotsmart-complete.html` - Frontend
- ✅ `render.yaml` - Render configuration (optional, for one-click deploy)
- ✅ `.env` - Environment variables (not committed, set in Render dashboard)

### Deployment Checklist

- [ ] Code pushed to Git repository
- [ ] Render service created
- [ ] Environment variables set (`GEMINI_API_KEY`)
- [ ] Service deployed successfully
- [ ] Health endpoint working (`/health`)
- [ ] Frontend accessible at root (`/`)
- [ ] API endpoint working (`/assess`)
- [ ] Custom domain configured (optional)

## Support

- **Render Docs**: [render.com/docs](https://render.com/docs)
- **Render Status**: [status.render.com](https://status.render.com)
- **Community**: [community.render.com](https://community.render.com)

For quick deployment steps, see `RENDER-QUICKSTART.md`
