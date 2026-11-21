#!/bin/sh
# Exports every geoscape model: each .blend to public/assets/models/<kind>.glb,
# the kind being what the game calls it (render/geoModels.ts). The rule each
# .blend follows is at the top of export-geo-model.py.
#   sh scripts/export-geo-models.sh [blend-dir]
set -e
dir="${1:-$HOME/Documents/Blends/Vamps/geoscape}"
blender="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
root="$(cd "$(dirname "$0")/.." && pwd)"
export_one() { # <blend name> <kind>
  "$blender" -b "$dir/$1.blend" --python "$root/scripts/export-geo-model.py" -- "$root/public/assets/models/$2.glb" | grep EXPORTED
}
export_one commercial_jet commercial
export_one charter_jet charter
export_one leased_jet jet
export_one helicopter helicopter
export_one SIGINT_station sigint
export_one Base base
export_one HUMINT_icon asset
