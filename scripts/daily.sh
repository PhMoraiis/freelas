#!/usr/bin/env bash
# Execução diária: varre, ranqueia e envia propostas (modo definido em config.ts).
#
# Sem argumentos (como o agendamento chama), roda no máximo uma vez por dia: se já houve uma
# execução bem-sucedida hoje, sai sem fazer nada. FORCE=1 ignora essa trava.
# Com argumentos (ex.: scripts/daily.sh --mode dry), é um teste manual: sempre roda, repassa os
# argumentos ao "npm run send" e não conta como a execução do dia.
# NOTIFY=0 desliga a notificação do macOS.
# Se o login do 99freelas tiver expirado, o robô abre a janela de login e continua quando ela for fechada.
set -uo pipefail

cd "$(dirname "$0")/.."
mkdir -p data/logs
log="data/logs/$(date +%Y-%m-%d).log"
stamp="data/logs/.last-success"
today="$(date +%Y-%m-%d)"
scheduled=$([ "$#" -eq 0 ] && echo 1 || echo 0)

notify() {
  [ "${NOTIFY:-1}" = "1" ] || return 0
  osascript -e "display notification \"$1\" with title \"freelas\"" >/dev/null 2>&1 || true
}

if [ "$scheduled" = "1" ] && [ "${FORCE:-0}" != "1" ] && [ "$(cat "$stamp" 2>/dev/null)" = "$today" ]; then
  echo "$(date '+%H:%M:%S') já rodou hoje; nada a fazer" >>"$log"
  exit 0
fi

# Uma execução por vez: enquanto uma espera o login, outro gatilho do dia não pode começar outra.
# A trava guarda o PID; se esse processo já não existe (ex.: Mac desligado no meio), ela é ignorada
lock="data/logs/.lock"
if ! mkdir "$lock" 2>/dev/null; then
  if kill -0 "$(cat "$lock/pid" 2>/dev/null)" 2>/dev/null; then
    echo "$(date '+%H:%M:%S') outra execução em andamento; nada a fazer" >>"$log"
    exit 0
  fi
  rm -rf "$lock" && mkdir "$lock"
fi
echo $$ >"$lock/pid"
trap 'rm -rf "$lock"' EXIT

# Logo após o login o Wi-Fi pode ainda não ter conectado: espera até 10 minutos pela rede
for _ in $(seq 1 20); do
  curl -sfI --max-time 10 https://www.99freelas.com.br >/dev/null 2>&1 && break
  sleep 30
done

echo "=== $(date '+%Y-%m-%d %H:%M:%S') ===" >>"$log"
if ! command -v npm >/dev/null 2>&1; then
  # O agendamento grava o caminho do Node na instalação; trocar a versão do Node exige reinstalar
  echo "npm não encontrado (PATH=$PATH)" >>"$log"
  notify "Falhou: Node/npm não encontrado. Rode npm run schedule -- install de novo."
  exit 127
fi
npm run send -- "$@" >>"$log" 2>&1
status=$?

if [ "$status" -eq 0 ]; then
  [ "$scheduled" = "1" ] && echo "$today" >"$stamp"
  summary=$(grep -E '^Resumo:|Nenhum projeto novo' "$log" | tail -1)
  notify "${summary:-Execução concluída}"
else
  # A mensagem de erro do robô começa com "✘" (ex.: sessão expirada → rode npm run login)
  error=$(grep '✘' "$log" | tail -1 | sed 's/^✘ //')
  notify "Falhou: ${error:-veja $log}"
fi
exit "$status"
