#!/usr/bin/env bash
# Agenda a execução diária no macOS (LaunchAgent do launchd): roda ao fazer login e também no
# horário escolhido, mas no máximo uma vez por dia (a trava fica no scripts/daily.sh).
#   scripts/schedule.sh install [HH:MM]   instala ou atualiza (horário padrão 09:00)
#   scripts/schedule.sh uninstall         remove o agendamento
#   scripts/schedule.sh status            mostra se está instalado e quando rodou
#   scripts/schedule.sh run               roda agora neste terminal, mesmo que já tenha rodado hoje
#   scripts/schedule.sh print [HH:MM]     só mostra o arquivo .plist que seria instalado
set -euo pipefail

label="local.99freelas-bot"
project="$(cd "$(dirname "$0")/.." && pwd)"
plist="$HOME/Library/LaunchAgents/$label.plist"
domain="gui/$(id -u)"
# O shell de login do usuário (o cadastrado no macOS, não o do terminal atual) carrega o PATH
# (node/npm) e as chaves GEMINI_API_KEY e GROQ_API_KEY
login_shell="$(dscl . -read "/Users/$USER" UserShell 2>/dev/null | awk '{print $2}')"
login_shell="${login_shell:-${SHELL:-/bin/zsh}}"

render() {
  local time="${1:-09:00}"
  if ! [[ "$time" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; then
    echo "Horário inválido: $time (use HH:MM)" >&2
    exit 1
  fi
  local hour=$((10#${time%%:*})) minute=$((10#${time##*:}))
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$login_shell</string>
    <string>-l</string>
    <string>-c</string>
    <string>'$project/scripts/daily.sh'</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$project</string>
  <!-- Ao fazer login (depois de ligar ou reiniciar o Mac) -->
  <key>RunAtLoad</key>
  <true/>
  <!-- Todo dia no horário; se o Mac estiver dormindo, roda quando ele acordar -->
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>$hour</integer>
    <key>Minute</key>
    <integer>$minute</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>$project/data/logs/launchd.log</string>
  <key>StandardErrorPath</key>
  <string>$project/data/logs/launchd.log</string>
</dict>
</plist>
PLIST
}

case "${1:-}" in
  install)
    mkdir -p "$HOME/Library/LaunchAgents" "$project/data/logs"
    launchctl bootout "$domain/$label" 2>/dev/null || true
    render "${2:-09:00}" >"$plist"
    plutil -lint "$plist" >/dev/null
    launchctl bootstrap "$domain" "$plist"
    echo "Agendado: ao fazer login e todos os dias às ${2:-09:00}, no máximo uma vez por dia."
    echo "Logs em $project/data/logs/"
    ;;
  uninstall)
    launchctl bootout "$domain/$label" 2>/dev/null || true
    rm -f "$plist"
    echo "Agendamento removido."
    ;;
  status)
    if launchctl print "$domain/$label" >/dev/null 2>&1; then
      echo "Instalado: $plist"
      grep -A4 StartCalendarInterval "$plist" | grep -o '<integer>[0-9]*' | sed 's/<integer>//' | paste -sd: - | sed 's/^/Horário (h:min): /'
      echo "Última execução bem-sucedida: $(cat "$project/data/logs/.last-success" 2>/dev/null || echo 'nenhuma')"
    else
      echo "Não instalado."
    fi
    ;;
  run)
    FORCE=1 "$login_shell" -l -c "'$project/scripts/daily.sh'"
    ;;
  print)
    render "${2:-09:00}"
    ;;
  *)
    sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
