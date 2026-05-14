#!/bin/bash

# Name of the output zip file
OUTPUT_ZIP="web-clipper.zip"

# Remove existing zip if it exists
if [ -f "$OUTPUT_ZIP" ]; then
    rm "$OUTPUT_ZIP"
fi

# Files to include
FILES=(
    "manifest.json"
    "background.js"
    "content_script.js"
    "options.html"
    "options.js"
    "green-clipboard-16.png"
    "green-clipboard-128.png"
)

echo "Bundling extension into $OUTPUT_ZIP..."

# Zip the files
zip "$OUTPUT_ZIP" "${FILES[@]}"

if [ $? -eq 0 ]; then
    echo "Successfully created $OUTPUT_ZIP"
else
    echo "Failed to create $OUTPUT_ZIP"
    exit 1
fi
