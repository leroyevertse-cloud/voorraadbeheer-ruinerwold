#!/bin/bash
set -e

SITE_ID="aa91e87f-570e-418b-9f57-248a1a3aaffd"

echo "Bouwen..."
npm run build

echo "Uploaden naar Netlify (draft)..."
DEPLOY_OUTPUT=$(netlify deploy --dir=dist 2>&1)
echo "$DEPLOY_OUTPUT"

DEPLOY_ID=$(echo "$DEPLOY_OUTPUT" | grep -o '[a-f0-9]\{24\}--voorraadbeheer' | head -1 | cut -d'-' -f1)

if [ -z "$DEPLOY_ID" ]; then
  echo "Fout: kon deploy ID niet vinden in output"
  exit 1
fi

echo "Deploy ID: $DEPLOY_ID"
echo "Publiceren naar productie..."
netlify api restoreSiteDeploy --data "{\"site_id\": \"$SITE_ID\", \"deploy_id\": \"$DEPLOY_ID\"}" > /dev/null

echo ""
echo "Klaar! Live op: https://voorraadbeheer-ruinerwold.netlify.app"
