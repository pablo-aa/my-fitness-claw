#!/bin/sh
# Keep a file the owner sent through a bot (a progress photo, a report) in the fitness folder.
#   keep.sh <file in the channel inbox> <path in this folder>
# Claude Code refuses a plain cp out of ~/.claude, where the channels keep their inbox; this copies only from an inbox,
# only to a new photo or PDF inside the current folder, so it never writes instructions, settings or code.
. "$(dirname "$0")/../hooks/lib.sh"
[ $# -eq 2 ] || { echo "usage: keep.sh <inbox file> <path in this folder>"; exit 1; }
case $1 in "$WA_DIR/inbox/"* | "$TG_DIR/inbox/"*) ;; *) echo "not from a channel inbox: $1"; exit 1 ;; esac
case $1/$2 in *..*) echo "no .. in paths"; exit 1 ;; esac
case /$2 in */ | //* | */.* | */-*) echo "the destination is a new path in this folder: $2"; exit 1 ;; esac
case $2 in *.jpg | *.jpeg | *.png | *.webp | *.heic | *.pdf) ;; *) echo "only a photo or a PDF: $2"; exit 1 ;; esac
[ -f "$1" ] || { echo "no such file: $1"; exit 1; }
[ -e "$2" ] || [ -L "$2" ] && { echo "already exists: $2"; exit 1; }
mkdir -p "$(dirname "$2")" || exit 1
# A folder on the way that is a link out of here is not inside the folder.
case $(cd "$(dirname "$2")" && pwd -P)/ in "$(pwd -P)"/*) ;; *) echo "outside this folder: $2"; exit 1 ;; esac
cp "$1" "$2" && echo "kept $2"
