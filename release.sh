#!/bin/bash

#cleanup
rm -rf ./docs/*

#build
npm run build

#copy to /docs
cp -r ./dist/* ./docs/

#replace paths
find ./docs -type f \( -name "*.html" -o -name "*.js" -o -name "*.css" \) | while read -r file; do
  sed -i \
    -e 's|/assets|/webgame2/assets|g' \
    -e 's|/vite\.svg|/webgame2/vite.svg|g' \
    -e 's|/models|/webgame2/models|g' \
    "$file"
done