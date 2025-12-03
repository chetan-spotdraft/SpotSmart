# Deploy to Render - Complete Guide

## ✅ Yes, You Can Deploy to Render!

Render is an excellent alternative to Netlify, especially for Node.js/Express applications. **Advantages over Netlify:**

- ✅ **No timeout limits** (unlike Netlify's 10s free tier / 26s pro tier)
- ✅ **Full Express server** (not just serverless functions)
- ✅ **Free tier available** with generous limits
- ✅ **Automatic HTTPS**
- ✅ **Easy environment variable management**

## Prerequisites

1. **Render Account**: Sign up at [render.com](https://render.com) (free tier available)
2. **GitHub/GitLab/Bitbucket Repository**: Your code should be in a Git repository
3. **Gemini API Key**: You'll need this for the AI features

## Deployment Options

### Option 1: One-Click Deploy (Using render.yaml) - Recommended

1. **Push your code to GitHub/GitLab/Bitbucket**
   ```bash
   git add .
   git commit -m "Ready for Render deployment"
   git push origin main
   ```

2. **In Render Dashboard:**
   - Click **"New +"** → **"Blueprint"**
   - Connect your repository
   - Render will detect `render.yaml` automatically
   - Click **"Apply"**

3. **Set Environment Variables:**
   - Go to your service → **Environment**
   - Add: `GEMINI_API_KEY` = your API key
   - Add: `NODE_ENV` = `production` (optional)
   - Render will auto-set `PORT`

4. **Deploy:**
   - Click **"Manual Deploy"** → **"Deploy latest commit"**
   - Wait for deployment (usually 2-5 minutes)

5. **Your app will be live at:**
   - `https://your-service-name.onrender.com`
   - Or custom domain if configured

### Option 2: Manual Setup (Step-by-Step)

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

## Post-Deployment

### 1. Verify Deployment

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

### 2. Custom Domain (Optional)

1. Go to your service → **Settings** → **Custom Domains**
2. Add your domain
3. Follow DNS configuration instructions
4. Render provides free SSL certificates automatically

## Render Free Tier Limits

- ✅ **750 hours/month** (enough for always-on service)
- ✅ **512 MB RAM**
- ✅ **No timeout limits** (unlike Netlify)
- ✅ **Automatic HTTPS**
- ⚠️ **Services sleep after 15 minutes of inactivity** (wake up on first request, ~30s delay)

### Upgrade Options

- **Starter Plan ($7/month)**: No sleep, better performance
- **Standard Plan ($25/month)**: More resources, better for production

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

## Comparison: Render vs Netlify

| Feature | Render | Netlify (Free) |
|---------|--------|----------------|
| Timeout Limit | None | 10 seconds |
| Server Type | Full Express | Serverless Functions |
| Free Tier | 750 hrs/month | Unlimited |
| Sleep After Inactivity | 15 min (free) | No sleep |
| Setup Complexity | Easy | Easy |
| Best For | Node.js apps | Static sites + Functions |

## Next Steps

1. ✅ Deploy to Render using instructions above
2. ✅ Test the assessment form
3. ✅ Verify AI features work (check Gemini debug section)
4. ✅ Set up custom domain (optional)
5. ✅ Consider upgrading if you need no-sleep service

## Support

- **Render Docs**: [render.com/docs](https://render.com/docs)
- **Render Status**: [status.render.com](https://status.render.com)
- **Community**: [community.render.com](https://community.render.com)

---

**Your app is now ready for Render deployment!** 🚀

