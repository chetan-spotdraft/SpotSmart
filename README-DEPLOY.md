# Quick Deployment Guide

## 🚀 Fastest Way to Deploy

### Deploy to Render (All-in-One) - Recommended

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Deploy on Render:**
   - Go to [render.com](https://render.com) and sign up
   - Click **"New +"** → **"Blueprint"**
   - Connect your GitHub repo
   - Render will auto-detect `render.yaml`
   - Click **"Apply"**

3. **Set Environment Variable:**
   - Go to service → **Environment**
   - Add: `GEMINI_API_KEY` = your API key
   - Save

4. **Deploy:**
   - Click **"Manual Deploy"** → **"Deploy latest commit"**
   - Wait 2-5 minutes

**Done!** Your app is live at `https://your-service.onrender.com`

---

## 📝 Files Needed

- ✅ `server.js` - Express server (serves API + frontend)
- ✅ `package.json` - Dependencies
- ✅ `spotsmart-complete.html` - Frontend
- ✅ `render.yaml` - Render config (optional)

---

## 🔧 Environment Variables

**Required:**
```
GEMINI_API_KEY=your_api_key_here
```

Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

---

## ⚠️ Important Notes

1. **Free Tier**: Services sleep after 15 min inactivity (~30s wake-up time)
2. **Upgrade**: Starter plan ($7/mo) for no sleep
3. **HTTPS**: Automatic on Render
4. **No Timeout Limits**: Unlike Netlify's 10s limit

---

## 🆘 Troubleshooting

**Service won't start?**
- Check logs in Render dashboard
- Verify `GEMINI_API_KEY` is set
- Check build logs for errors

**API not working?**
- Test health endpoint: `https://your-service.onrender.com/health`
- Check environment variables
- Review service logs

**Service sleeping?**
- Normal on free tier
- First request takes ~30s to wake up
- Upgrade to Starter for no sleep

---

For detailed instructions, see:
- `RENDER-DEPLOY.md` - Complete guide
- `RENDER-QUICKSTART.md` - Quick reference
- `DEPLOYMENT.md` - Full deployment guide
