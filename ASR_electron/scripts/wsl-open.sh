#!/bin/bash
# WSL2 wrapper to open URLs in Windows default browser

if [ -z "$1" ]; then
    echo "Usage: wsl-open <url>"
    exit 1
fi

url="$1"

# Use Windows cmd to open the URL with the default browser
cmd.exe /c start "$url" 2>/dev/null

exit 0
