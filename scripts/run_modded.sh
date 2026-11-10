#!/bin/sh
set -eu
WORKSHOP_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BROFORCE_GAME_PATH=$(python3 "$WORKSHOP_ROOT/scripts/workshop_paths.py")
export BROFORCE_GAME_PATH
# Snap Steam uses a private IPC directory and its own HOME/config environment.
# Enter that environment so the game reaches the running Steam client.
case "$BROFORCE_GAME_PATH" in
    */snap/steam/common/*)
        if [ "${SNAP_NAME:-}" != steam ]; then
            exec snap run --shell steam -c 'exec "$@"' workshop "$WORKSHOP_ROOT/scripts/run_modded.sh" "$@"
        fi
        ;;
esac
if pgrep -x Broforce.x86_64 >/dev/null; then
    echo 'Broforce is already running. Close it before starting the Workshop profile.' >&2
    exit 1
fi
if [ ! -f "$WORKSHOP_ROOT/runtime/profile/UMM/Mods/BroforceWorkshop/WorkshopBridge.dll" ]; then
    echo 'Run python scripts/prepare_profile.py first.' >&2
    exit 1
fi
if ! pgrep -x steam >/dev/null; then
    steam -silent > "$WORKSHOP_ROOT/runtime/steam-launch.log" 2>&1 &
    workshop_wait=0
    while ! pgrep -x steam >/dev/null; do
        workshop_wait=$((workshop_wait+1))
        if [ "$workshop_wait" -ge 30 ]; then
            echo 'Steam did not start. Open Steam and retry this launcher.' >&2
            exit 1
        fi
        sleep 1
    done
    sleep 5
fi
export SteamAppId=274190
export SteamGameId=274190
export BROFORCE_WORKSHOP_ROOT="$WORKSHOP_ROOT"
cd "$BROFORCE_GAME_PATH"
exec python3 "$WORKSHOP_ROOT/scripts/launch_doorstop.py" "$BROFORCE_GAME_PATH/Broforce.x86_64" -screen-fullscreen 0 -screen-width 1600 -screen-height 900 "$@"
