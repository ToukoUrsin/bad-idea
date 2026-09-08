#!/bin/zsh
set -eu

cd -- "${0:A:h}"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
bad_idea_port="${PORT:-4320}"
bad_idea_url="http://localhost:$bad_idea_port"

fail() {
  print -u2 -- "$1"
  if [[ -t 0 ]]; then read -r '?Press Enter to close…'; fi
  exit 1
}

command -v node >/dev/null || fail 'Install Node.js 22 or newer, then open this launcher again.'
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' || fail 'Bad Idea needs Node.js 22 or newer.'

game_ready() {
  curl --fail --silent --max-time 1 "$bad_idea_url/api/health" | node -e '
    try {
      const health = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
      process.exit(health.execution === "direct" && typeof health.ready === "boolean" && typeof health.model === "string" ? 0 : 1);
    } catch { process.exit(1); }
  '
}

if game_ready; then
  print -- "Bad Idea is already running at $bad_idea_url. Opening the game."
  open "$bad_idea_url"
  exit 0
fi

if [[ ! -d node_modules ]]; then
  print -- 'Installing game dependencies…'
  npm ci || fail 'Dependency installation failed. Check the connection and try again.'
fi

bad_idea_use_vault=false
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  print -- 'Using the API key from your environment.'
elif command -v hsec >/dev/null && hsec exec --only OPENAI_API_KEY -- node -e 'process.exit(process.env.OPENAI_API_KEY ? 0 : 1)' >/dev/null 2>&1; then
  bad_idea_use_vault=true
  print -- 'Using the API key from your local vault.'
else
  print -- 'Astra is offline: no API key is available.'
  print -- 'Starter inventions and the three original rooms work. AI inventions and new adaptive rooms require OPENAI_API_KEY.'
fi

print -- "Starting Bad Idea at $bad_idea_url"
print -- 'Keep this Terminal window open. Press Ctrl-C here to stop the game server.'
(
  for bad_idea_attempt in {1..40}; do
    if game_ready; then open "$bad_idea_url"; exit 0; fi
    sleep 0.25
  done
  print -- "The browser could not open automatically. Once the server is ready, open $bad_idea_url."
) &

if [[ "$bad_idea_use_vault" == true ]]; then
  exec hsec exec --only OPENAI_API_KEY -- node --import tsx server.mjs
else
  exec node --import tsx server.mjs
fi
