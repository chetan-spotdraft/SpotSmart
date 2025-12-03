# 🚀 Deploy to Render - Step by Step Guide

## ✅ Prerequisites (You've Done This!)
- ✅ Code uploaded to Git (GitHub/GitLab/Bitbucket)
- ✅ `render.yaml` file exists
- ✅ All files committed and pushed

## 📋 Step-by-Step Deployment

### Step 1: Sign Up / Login to Render

1. Go to **[render.com](https://render.com)**
2. Click **"Get Started"** or **"Sign In"**
3. Sign up with GitHub/GitLab/Bitbucket (recommended) or email

### Step 2: Create New Blueprint

1. In Render dashboard, click **"New +"** (top right)
2. Select **"Blueprint"**
3. Connect your Git provider (GitHub/GitLab/Bitbucket)
4. Authorize Render to access your repositories
5. Select your repository containing the SpotSmart project
6. Render will automatically detect `render.yaml`
7. Click **"Apply"** or **"Save Changes"**

### Step 3: Configure Environment Variables

**IMPORTANT:** You must set the Gemini API key!

1. After the blueprint is created, you'll see your service
2. Click on your service name (e.g., `spotsmart-assessment`)
3. Go to **"Environment"** tab (left sidebar)
4. Click **"Add Environment Variable"**
5. Add:
   - **Key**: `GEMINI_API_KEY`
   - **Value**: Your Gemini API key (get from [Google AI Studio](https://makersuite.google.com/app/apikey))
6. Click **"Save Changes"**

### Step 4: Deploy

1. Go to **"Events"** or **"Manual Deploy"** tab
2. Click **"Manual Deploy"** → **"Deploy latest commit"**
3. Wait for deployment (usually 2-5 minutes)
4. Watch the build logs to see progress

### Step 5: Verify Deployment

1. Once deployment completes, you'll see a URL like:
   ```
   https://spotsmart-assessment.onrender.com
   ```

2. **Test Health Endpoint:**
   ```
   https://your-service.onrender.com/health
   ```
   Should return: `{"status":"ok","gemini_available":true,...}`

3. **Test Main App:**
   ```
   https://your-service.onrender.com/
   ```
   Should show the assessment form

4. **Test Full Flow:**
   - Click "Fill with Sample Data & View Results (Testing)"
   - Should complete assessment and show results
   - Check "Gemini AI Request/Response" section

## 🎉 Success!

Your app is now live! Share the URL with your team.

---

## 🔧 Troubleshooting

### Build Fails

**Check:**
- Build logs in Render dashboard
- Ensure `package.json` has all dependencies
- Verify Node.js version (Render auto-detects)

**Common Issues:**
- Missing dependencies → Check `package.json`
- Port binding error → Server should use `process.env.PORT` (already configured)

### Service Won't Start

**Check:**
- Service logs in Render dashboard
- Verify `GEMINI_API_KEY` is set
- Check that `server.js` starts correctly

**Common Issues:**
- Missing `GEMINI_API_KEY` → Set in Environment tab
- Port issues → Server already uses `process.env.PORT`

### API Not Working

**Check:**
1. Health endpoint: `https://your-service.onrender.com/health`
2. Service logs for errors
3. Browser console for CORS issues (shouldn't happen, CORS is enabled)

### Service Sleeping (Free Tier)

- **Normal behavior**: Services sleep after 15 min inactivity
- **First request**: Takes ~30 seconds to wake up
- **Solution**: Upgrade to Starter plan ($7/month) for no sleep

---

## 📝 Post-Deployment Checklist

- [ ] Service deployed successfully
- [ ] Health endpoint working (`/health`)
- [ ] Frontend accessible at root (`/`)
- [ ] API endpoint working (`/assess`)
- [ ] Gemini AI working (check debug section)
- [ ] Sample data button works
- [ ] Full assessment flow tested

---

## 🔄 Updating Your App

After making changes:

1. **Commit and push to Git:**
   ```bash
   git add .
   git commit -m "Your update message"
   git push origin main
   ```

2. **Render will auto-deploy** (if auto-deploy is enabled)
   - Or manually trigger: **Manual Deploy** → **Deploy latest commit**

---

## 💰 Pricing

### Free Tier
- ✅ 750 hours/month
- ✅ 512 MB RAM
- ✅ No timeout limits
- ⚠️ Services sleep after 15 min inactivity

### Starter Plan ($7/month)
- ✅ No sleep
- ✅ Better performance
- ✅ 512 MB RAM

### Standard Plan ($25/month)
- ✅ More resources
- ✅ Better for production
- ✅ 2 GB RAM

---

## 🆘 Need Help?

1. **Check Render Logs**: Service → Logs tab
2. **Check Build Logs**: Service → Events tab
3. **Render Docs**: [render.com/docs](https://render.com/docs)
4. **Render Status**: [status.render.com](https://status.render.com)

---

## 📚 Additional Resources

- **Full Guide**: See `RENDER-DEPLOY.md`
- **Quick Reference**: See `RENDER-QUICKSTART.md`
- **General Deployment**: See `DEPLOYMENT.md`

---

**You're all set! Good luck with your deployment! 🚀**

