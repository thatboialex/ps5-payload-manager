#!/bin/bash
# Payload Manager - Automated Build & Deploy Script

if [ -z "$1" ]; then
    echo "Usage: ./deploy.sh [PS5_IP]"
    exit 1
fi

PS5_IP="$1"
MENU_PORT="8084"
LOADER_PORT="9021"
ELF="pldmgr.elf"

echo "--- Deploying Payload Manager to $PS5_IP ---"

# 1. Shutdown current instance
echo "[1/4] Requesting shutdown at http://$PS5_IP:$MENU_PORT/shutdown..."
curl -s --connect-timeout 2 --max-time 4 http://$PS5_IP:$MENU_PORT/shutdown > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "      Shutdown command sent."
else
    echo "      Payload Manager was not active (skipped shutdown)."
fi

# 2. Build the React Frontend
echo "[2/4] Building React Frontend..."
make frontend-build > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "      !!! Frontend build FAILED!"
    exit 1
fi
echo "      Frontend build successful."

# 3. Build the native ELF via Docker
echo "[3/4] Building native ELF via Docker..."
docker run --rm -v "$(pwd)":/src -w /src ps5-payload-sdk make clean all > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "      !!! ELF build FAILED! Check Makefile or source errors."
    exit 1
fi
echo "      ELF build successful."

# 4. Send to PS5
if [ -f "$ELF" ]; then
    echo "[4/4] Sending $ELF to $PS5_IP:$LOADER_PORT via socat..."
    socat -u - TCP:$PS5_IP:$LOADER_PORT < "$ELF"
    if [ $? -eq 0 ]; then
        echo "--- Deployment Complete! ---"
    else
        echo "      !!! Failed to send ELF. Is the loader running on PS5?"
        exit 1
    fi
else
    echo "      !!! $ELF not found!"
    exit 1
fi
