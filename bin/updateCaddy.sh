#!/bin/bash

# Determine the directory of the running script (A/bin)
SCRIPT_DIR=$(dirname "$0")

# Get the parent directory (A)
DIR_A=$(cd "$SCRIPT_DIR/.." && pwd)

# Define the path to the Caddyfile in folder A
CADDYFILE_A="$DIR_A/Caddyfile"

# Define the path to the Caddyfile in folder B
DIR_B=$(cd "$SCRIPT_DIR/../../caddy" && pwd) 
CADDYFILE_B="$DIR_B/Caddyfile"

# Check if Caddyfile A exists
if [ ! -f "$CADDYFILE_A" ]; then
  echo "Caddyfile in folder A does not exist."
  exit 1
fi

# Backup the original Caddyfile B
cp "$CADDYFILE_B" "$CADDYFILE_B.bak"

# Read the Caddyfile A content
HOST_ENTRIES_A=$(awk '/^[^ \t]/ {if (block) print block; block=$0; next} {block=block "\n" $0} END {if (block) print block}' "$CADDYFILE_A")

# Read the existing content of Caddyfile B
CADDYFILE_B_CONTENT=$(<"$CADDYFILE_B")

# Function to remove existing host entries from Caddyfile B content
remove_existing_host_entries() {
  local host="$1"
  CADDYFILE_B_CONTENT=$(echo "$CADDYFILE_B_CONTENT" | awk -v host="$host" '
  BEGIN {block=""; inBlock=0}
  /^[^ \t]/ {
    if (inBlock) {
      if (index(block, host) > 0) {
        block="";
      } else {
        print block "\n}";
      }
    }
    block=$0;
    inBlock=1;
    next;
  }
  {
    block=block "\n" $0;
  }
  END {
    if (inBlock && index(block, host) == 0) {
      print block "\n}";
    }
  }')
}

# Remove existing host entries in B that are also in A
while IFS= read -r entry; do
  host=$(echo "$entry" | head -n 1)
  remove_existing_host_entries "$host"
done <<< "$HOST_ENTRIES_A"

# Append the host entries from A to B content
echo -e "$CADDYFILE_B_CONTENT\n$HOST_ENTRIES_A" > "$CADDYFILE_B"

echo "Caddyfile updated successfully."

