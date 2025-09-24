# Interview GPT Deployment Guide

## 🚀 Quick Deployment Options

### Option 1: Vercel (Recommended - Free & Easy)

1. **Install Vercel CLI:**
```bash
npm install -g vercel
```

2. **Login to Vercel:**
```bash
vercel login
```

3. **Deploy from your VS Code terminal:**
```bash
# In your project root directory
vercel

# Follow the prompts:
# - Set up and deploy? Y
# - Which scope? (select your account)
# - Link to existing project? N
# - Project name: interview-gpt (or your choice)
# - Directory: ./ (current directory)
# - Override settings? N
```

4. **Set Environment Variables:**
After deployment, go to Vercel dashboard → Your Project → Settings → Environment Variables and add:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

5. **Redeploy with env vars:**
```bash
vercel --prod
```

---

### Option 2: Netlify (Free & Popular)

1. **Install Netlify CLI:**
```bash
npm install -g netlify-cli
```

2. **Build your project:**
```bash
npm run build
```

3. **Deploy:**
```bash
netlify login
netlify deploy --prod --dir=dist
```

4. **Set Environment Variables:**
Go to Netlify dashboard → Site Settings → Environment Variables

---

### Option 3: GitHub Pages (Free)

1. **Install gh-pages:**
```bash
npm install --save-dev gh-pages
```

2. **Add to package.json:**
```json
{
  "scripts": {
    "predeploy": "npm run build",
    "deploy": "gh-pages -d dist"
  },
  "homepage": "https://yourusername.github.io/interview-gpt"
}
```

3. **Deploy:**
```bash
npm run deploy
```

---

### Option 4: Firebase Hosting (Google - Free)

1. **Install Firebase CLI:**
```bash
npm install -g firebase-tools
```

2. **Login and initialize:**
```bash
firebase login
firebase init hosting
```

3. **Configure firebase.json:**
```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

4. **Deploy:**
```bash
npm run build
firebase deploy
```

---

## 🔧 Pre-Deployment Setup

### 1. Create Production Build:
```bash
npm run build
```

### 2. Test Production Build Locally:
```bash
npm run preview
```

### 3. Environment Variables Setup:
Create `.env.production` file:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## 🌟 Recommended: Vercel Deployment (Step by Step)

### Step 1: Prepare Your Code
```bash
# Make sure everything is committed
git add .
git commit -m "Ready for deployment"

# Test build locally
npm run build
npm run preview
```

### Step 2: Deploy to Vercel
```bash
# Install Vercel CLI if not installed
npm install -g vercel

# Login to Vercel
vercel login

# Deploy (run this in your project root)
vercel

# When prompted:
# ? Set up and deploy "~/your-project"? [Y/n] Y
# ? Which scope do you want to deploy to? (Use your account)
# ? Link to existing project? [y/N] N
# ? What's your project's name? interview-gpt
# ? In which directory is your code located? ./
# ? Want to override the settings? [y/N] N
```

### Step 3: Configure Environment Variables
1. Go to [vercel.com](https://vercel.com) → Your Project → Settings → Environment Variables
2. Add these variables:
   - `VITE_SUPABASE_URL` = `https://your-project-id.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `your-anon-key`

### Step 4: Redeploy with Environment Variables
```bash
vercel --prod
```

### Step 5: Get Your Live URL
Vercel will provide you with a URL like: `https://interview-gpt-xyz.vercel.app`

---

## 🔗 Custom Domain (Optional)

### For Vercel:
1. Go to Project Settings → Domains
2. Add your custom domain
3. Configure DNS records as instructed

### For Netlify:
1. Go to Site Settings → Domain Management
2. Add custom domain
3. Configure DNS

---

## 📱 Mobile Optimization

Your app is already mobile-responsive, but for PWA features, add to `index.html`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#8b5cf6">
<link rel="manifest" href="/manifest.json">
```

---

## 🚨 Important Notes

1. **Environment Variables:** Make sure to set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
2. **Build Command:** `npm run build`
3. **Output Directory:** `dist`
4. **Node Version:** Use Node 18+ for best compatibility

---

## 🎯 Quick Start (Vercel - 5 minutes)

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Login
vercel login

# 3. Deploy
vercel

# 4. Set environment variables in Vercel dashboard
# 5. Redeploy
vercel --prod
```

Your Interview GPT will be live! 🚀