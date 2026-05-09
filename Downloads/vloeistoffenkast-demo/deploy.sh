#!/bin/bash
set -e

echo "Bouwen..."
npm run build

echo "Deployen naar Netlify..."
netlify deploy --prod --dir=dist

echo "Klaar!"
