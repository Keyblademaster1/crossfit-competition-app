#!/bin/bash
#
# Double-click this in Finder to start the app.
#
# It starts the database, puts the demo competition back to a known state,
# runs the app on this laptop and opens it in a browser. Nothing here needs
# the internet. Close the Terminal window to stop it.

cd "$(dirname "$0")" || exit 1

# Finder starts this with a bare PATH, so Homebrew's node and psql are added.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

PORT=3000
URL="http://localhost:$PORT"

printf '\n  Competition scoring\n  ===================\n\n'

if ! command -v node >/dev/null 2>&1; then
  echo "  Node is not installed. Install it from https://nodejs.org and try again."
  echo; read -r -p "  Press return to close." _; exit 1
fi

if [ ! -d node_modules ]; then
  echo "  First run, fetching what the app needs. This takes a minute..."
  npm install --silent || { echo "  Could not install."; read -r _; exit 1; }
fi

if ! pg_isready -q 2>/dev/null; then
  echo "  Starting the database..."
  brew services start postgresql@17 >/dev/null 2>&1
  for _ in $(seq 1 20); do pg_isready -q 2>/dev/null && break; sleep 1; done
fi

if ! pg_isready -q 2>/dev/null; then
  echo "  The database would not start."
  echo "  Try:  brew install postgresql@17 && brew services start postgresql@17"
  echo; read -r -p "  Press return to close." _; exit 1
fi

echo "  Preparing the data..."
npm run db:local --silent >/dev/null 2>&1
npm run db:seed --silent >/dev/null 2>&1

echo "  Starting the app..."
npm run dev:local --silent &
APP_PID=$!

# Wait for it to answer before opening a browser, so nobody sees an error page.
for _ in $(seq 1 60); do
  if curl -s -o /dev/null -m 2 "$URL"; then break; fi
  sleep 1
done

open "$URL"

ADDRESS=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
printf '\n  Open on this laptop:  %s\n' "$URL"
[ -n "$ADDRESS" ] && printf '  On a TV or phone:     http://%s:%s\n' "$ADDRESS" "$PORT"
printf '\n  Close this window to stop the app.\n\n'

# Stop the app if this window is closed.
trap 'kill $APP_PID 2>/dev/null' EXIT
wait $APP_PID
