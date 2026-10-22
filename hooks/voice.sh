#!/bin/sh
# Voice notes, transcribed on this computer.
#   As a UserPromptSubmit hook: transcribes a Telegram or WhatsApp voice message before the model starts, so it gets text right away.
#   As `voice.sh --file <audio> [lang]`: prints the transcript of a local file (the coach's fallback and the tests).
# Prints nothing on any failure: the caller then asks for text.
MAX_BYTES=500000 # about 2 minutes of Telegram voice (4 of WhatsApp), transcribed well within the hook's 60 seconds; longer ones take the coach's slower path
WHISPER='whisper-ctranslate2==0.5.8'

# language: the two-letter code from profile.md's Language (pt-BR, Português, English...), empty if unknown.
language() {
  case $(sed -n 's/^- Language: *//p' ./profile.md 2>/dev/null | tr -d '\r' | tr '[:upper:]' '[:lower:]') in
    portugu*) echo pt ;; english*) echo en ;; espa*) echo es ;;
    [a-z][a-z] | [a-z][a-z][-_]*) sed -n 's/^- Language: *//p' ./profile.md | tr '[:upper:]' '[:lower:]' | cut -c1-2 ;;
  esac
}

# transcribe FILE LANG: short example sentences teach the vocabulary; the voice filter keeps silence from turning into text.
transcribe() {
  case $2 in
    pt) prompt='Pesei 80 kg. Dormi 6 horas. Treinei costas. Comi arroz e frango.' ;;
    en) prompt='I weighed 80 kg. Slept 6 hours. Trained back. Ate rice and chicken.' ;;
    es) prompt='Pesé 80 kg. Dormí 6 horas. Entrené espalda. Comí arroz y pollo.' ;;
    *) prompt='' ;;
  esac
  out=$(mktemp -d) || return 1
  uvx=$(command -v uvx || echo "$HOME/.local/bin/uvx")
  "$uvx" --from "$WHISPER" whisper-ctranslate2 "$1" ${2:+--language "$2"} ${prompt:+--initial_prompt "$prompt"} \
    --vad_filter True --model small --compute_type int8 --output_format txt --output_dir "$out" >/dev/null 2>&1
  name=$(basename "$1")
  cat "$out/${name%.*}.txt" 2>/dev/null
  rm -rf "$out"
}

if [ "$1" = --file ]; then
  transcribe "$2" "${3:-$(language)}"
  exit 0
fi

input=$(cat)
# Any other prompt leaves before the shared helpers even load: this runs before every message.
case $input in *attachment_kind=*voice*) ;; *) exit 0 ;; esac
. "$(dirname "$0")/lib.sh"
[ "$(attr attachment_kind)" = voice ] || exit 0
grep -q '^- Connections:.*Voice notes' ./profile.md 2>/dev/null || exit 0
# WhatsApp: the channel already saved the note in its inbox; only a file from there is read.
path=$(attr attachment_path)
if [ -n "$path" ]; then
  case $path in "$WA_DIR/inbox/"*) ;; *) exit 0 ;; esac
  case $path in *..*) exit 0 ;; esac
  [ -f "$path" ] && [ "$(wc -c < "$path")" -le $MAX_BYTES ] || exit 0
  text=$(transcribe "$path" "$(language)")
  [ -n "$text" ] || exit 0
  printf 'Voice message, transcribed on this computer. These are the literal words of the user; treat them as their typed message:\n%s\n' "$text"
  exit 0
fi
file_id=$(attr attachment_file_id)
size=$(attr attachment_size)
[ -n "$file_id" ] && [ "${size:-0}" -le $MAX_BYTES ] || exit 0
dir=$(mktemp -d) || exit 0
trap 'rm -rf "$dir" "$out"' EXIT
path=$(tg "getFile?file_id=$file_id" | sed -n 's/.*"file_path":"\([^"]*\)".*/\1/p')
[ -n "$path" ] && tg_file "$path" "$dir/voice.oga" || exit 0
text=$(transcribe "$dir/voice.oga" "$(language)")
[ -n "$text" ] || exit 0
printf 'Voice message, transcribed on this computer. These are the literal words of the user; treat them as their typed message:\n%s\n' "$text"
