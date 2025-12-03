# ✅ Pre-Deployment Checklist

Use this checklist to ensure everything is ready before deploying to Render.

## 📦 Code Preparation

- [x] All files committed to Git
- [x] Code pushed to GitHub/GitLab/Bitbucket
- [x] `render.yaml` file exists
- [x] `package.json` has all dependencies
- [x] `server.js` configured correctly
- [x] `.env` file is in `.gitignore` (API keys should NOT be in Git)

## 🔑 API Keys & Environment Variables

- [ ] **Gemini API Key obtained**
  - Get from: [Google AI Studio](https://makersuite.google.com/app/apikey)
  - Keep it safe - you'll need it for Render

## 🌐 Render Account

- [ ] **Render account created**
  - Sign up at: [render.com](https://render.com)
  - Connect GitHub/GitLab/Bitbucket (recommended)

## 📋 Deployment Steps

- [ ] **Blueprint created** in Render
- [ ] **Repository connected** to Render
- [ ] **Environment variable set**: `GEMINI_API_KEY`
- [ ] **Service deployed** successfully
- [ ] **Health check passed**: `/health` endpoint works

## ✅ Post-Deployment Verification

- [ ] **Frontend accessible**: Root URL shows the form
- [ ] **API working**: `/assess` endpoint responds
- [ ] **Gemini AI working**: Assessment completes with AI insights
- [ ] **Sample data works**: Test button completes successfully
- [ ] **No errors in logs**: Check Render service logs

## 🎯 Ready to Deploy?

If all items above are checked (except post-deployment), you're ready!

**Next Step**: Follow `DEPLOY-NOW.md` for detailed instructions.

---

## 📝 Quick Command Reference

```bash
# Check Git status
git status

# Commit changes
git add .
git commit -m "Ready for deployment"

# Push to remote
git push origin main

# Verify files are pushed
git log --oneline -5
```

---

**Good luck! 🚀**

