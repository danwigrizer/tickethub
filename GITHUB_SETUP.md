# GitHub Setup for Railway Deployment

Your code is committed and ready to push to GitHub. Follow these steps:

## Step 1: Create a GitHub Repository

1. Go to [GitHub.com](https://github.com) and sign in
2. Click the "+" icon in the top right → "New repository"
3. Name your repository (e.g., `ticket-marketplace` or `agentic-ticket-app`)
4. Choose Public or Private
5. **DO NOT** initialize with README, .gitignore, or license (we already have these)
6. Click "Create repository"

## Step 2: Add GitHub Remote

After creating the repository, GitHub will show you commands. Run these in your terminal:

```bash
cd /Users/dw/dev/Agentic
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

**Or if you prefer SSH:**
```bash
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

Replace:
- `YOUR_USERNAME` with your GitHub username
- `YOUR_REPO_NAME` with the repository name you created

## Step 3: Verify

After pushing, verify your repository has all files:
- ✅ Docker files (Dockerfile, docker-compose.yml)
- ✅ Deployment documentation (DEPLOYMENT.md)
- ✅ Updated source files
- ✅ Environment variable examples

## Step 4: Deploy to Railway

Once your code is on GitHub:

1. Go to [railway.app](https://railway.app) and sign up/login
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Authorize Railway to access your GitHub account
5. Select your repository
6. Railway will automatically detect `docker-compose.yml` and set up both services
7. Add environment variables in Railway dashboard:
   - `CORS_ORIGIN`: Your domain (or `*` for testing)
   - `NEXT_PUBLIC_API_URL`: Will be set automatically, but you can customize
8. Deploy!

## Quick Command Reference

If you need to check your current setup:
```bash
# Check git status
git status

# Check remotes
git remote -v

# View recent commits
git log --oneline -5
```

## Troubleshooting

**If you get "remote already exists":**
```bash
git remote remove origin
# Then add it again with the correct URL
```

**If you need to rename your branch:**
```bash
git branch -M main  # Renames master to main
```

**If you need to force push (be careful!):**
```bash
git push -u origin main --force
```

