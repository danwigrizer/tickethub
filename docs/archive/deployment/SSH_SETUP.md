# SSH Key Setup for GitHub

## Your SSH Public Key

Your SSH public key is:
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINL+pA5saSYK8R+eATL7QOva3+i35y109Q6fdoqnaH0o wigrizer@gmail.com
```

## Add to GitHub

1. **Copy the entire key above** (from `ssh-ed25519` to the end)

2. **Go to GitHub:**
   - Visit: https://github.com/settings/keys
   - Or: GitHub.com → Settings → SSH and GPG keys

3. **Add the key:**
   - Click "New SSH key"
   - Title: "Mac - tickethub" (or any name you prefer)
   - Key: Paste the entire key
   - Click "Add SSH key"

4. **Test the connection:**
   ```bash
   ssh -T git@github.com
   ```
   You should see: "Hi danwigrizer! You've successfully authenticated..."

5. **Push your code:**
   ```bash
   cd /Users/dw/dev/Agentic
   git push -u origin main
   ```

## If Your Key Has a Passphrase

If your SSH key is password-protected, you'll be prompted for the passphrase when:
- Adding to SSH agent: `ssh-add ~/.ssh/id_ed25519`
- Pushing to GitHub: `git push`

You can add it to the SSH agent to avoid repeated prompts:
```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

## Verify Setup

After adding the key to GitHub, test with:
```bash
ssh -T git@github.com
```

Then push:
```bash
git push -u origin main
```

