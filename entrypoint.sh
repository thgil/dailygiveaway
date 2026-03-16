#!/bin/sh
# Fix ownership of the mounted /data volume so the non-root user can write to it
chown -R giveaway:giveaway /data 2>/dev/null || true

# Drop privileges and run the command as the giveaway user
exec gosu giveaway "$@"
