#!/bin/bash
# ============================================================
# VendorTrack — Git History Secret Purge Script
# ============================================================
#
# This script permanently removes all secrets from Git history.
# Run this AFTER rotating all exposed credentials.
#
# WARNING: This rewrites git history. All collaborators must
# re-clone the repository after this script runs.
#
# Prerequisites:
#   pip install git-filter-repo
#   # OR
#   brew install git-filter-repo
#
# ============================================================

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     VendorTrack — Git History Secret Purge                  ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                             ║"
echo "║  WARNING: This will rewrite Git history.                    ║"
echo "║  All collaborators must re-clone after this operation.      ║"
echo "║                                                             ║"
echo "║  Ensure you have ROTATED all credentials BEFORE running.    ║"
echo "║  Old keys in history will be useless after rotation.        ║"
echo "║                                                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

read -p "Have you rotated ALL exposed credentials? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Aborted. Rotate all credentials first, then re-run this script."
    exit 1
fi

echo ""
echo "Step 1: Creating backup branch..."
git branch backup-before-purge 2>/dev/null || true
echo "✅ Backup branch created: backup-before-purge"

echo ""
echo "Step 2: Removing .env files from Git history..."
git filter-repo --invert-paths --path .env --path .env.local --path .env.production --path .env.development --force

echo ""
echo "Step 3: Removing specific secret patterns from all files..."
# Create a patterns file for git-filter-repo
cat > /tmp/vendortrack-secret-patterns.txt << 'EOF'
REDACTED_STRIPE_SECRET_KEY==>REDACTED_STRIPE_SECRET_KEY
REDACTED_STRIPE_PUBLISHABLE_KEY==>REDACTED_STRIPE_PUBLISHABLE_KEY
REDACTED_SUPABASE_SERVICE_ROLE_KEY==>REDACTED_SUPABASE_SERVICE_ROLE_KEY
REDACTED_SUPABASE_ANON_KEY==>REDACTED_SUPABASE_ANON_KEY
REDACTED_SUPABASE_URL==>REDACTED_SUPABASE_URL
EOF

git filter-repo --replace-text /tmp/vendortrack-secret-patterns.txt --force

echo ""
echo "Step 4: Running Gitleaks to verify no secrets remain..."
if command -v gitleaks >/dev/null 2>&1; then
    gitleaks detect --config=.gitleaks.toml -v --redact
    if [ $? -eq 0 ]; then
        echo "✅ No secrets detected in Git history"
    else
        echo "⚠️  Gitleaks found potential secrets — review manually"
    fi
else
    echo "⚠️  Gitleaks not installed — manual verification required"
fi

echo ""
echo "Step 5: Force-pushing cleaned history to all remotes..."
echo "⚠️  This step is commented out for safety. Uncomment when ready."
echo ""
echo "  git push origin --force --all"
echo "  git push origin --force --tags"
echo ""

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Git History Purge Complete                                  ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                             ║"
echo "║  Next steps:                                                ║"
echo "║  1. Verify: gitleaks detect --config=.gitleaks.toml        ║"
echo "║  2. Force-push: git push origin --force --all              ║"
echo "║  3. Notify all collaborators to re-clone                   ║"
echo "║  4. Delete backup branch: git branch -D backup-before-purge║"
echo "║                                                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
