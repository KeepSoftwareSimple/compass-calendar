#!/bin/sh

# Shared config parsing for every self-host entry point. Keep this POSIX-only:
# install.sh is commonly piped to `sh`, while install-manual.sh also runs under
# Bash. Callers set CONFIG_FILE before sourcing it.

strip_quotes() {
  value=$1

  case $value in
    \"*\")
      value=${value#\"}
      value=${value%%\"*}
      ;;
    \'*\')
      value=${value#\'}
      value=${value%%\'*}
      ;;
    *" #"*)
      value=${value%%" #"*}
      while :; do
        case $value in
          *" ")
            value=${value% }
            ;;
          *)
            break
            ;;
        esac
      done
      ;;
  esac

  printf '%s\n' "$value"
}

read_config_value() {
  path=$1

  [ -f "$CONFIG_FILE" ] || return 0

  awk -v path="$path" '
    BEGIN { count = split(path, parts, ".") }
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      line = $0
      sub(/[[:space:]]+#.*/, "", line)
      indent = match(line, /[^ ]/) - 1
      level = int(indent / 2) + 1
      key = line
      sub(/:.*/, "", key)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
      value = line
      sub(/^[^:]+:[[:space:]]*/, "", value)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      gsub(/^"|"$/, "", value)
      gsub(/^'\''|'\''$/, "", value)
      stack[level] = key
      for (i = level + 1; i <= 8; i++) stack[i] = ""
      if (level != count || key != parts[count] || value == "") next
      for (i = 1; i < count; i++) {
        if (stack[i] != parts[i]) next
      }
      print value
    }
  ' "$CONFIG_FILE" | tail -n 1
}

# The profiles this install actually needs, read from its own config. An
# explicit COMPOSE_PROFILES still wins in the caller's environment.
# Short hash of compass.yaml. Exported as COMPASS_CONFIG_REVISION so Compose
# recreates config-reading services when the file changes without an image bump.
config_file_revision() {
  [ -f "$CONFIG_FILE" ] || {
    printf '%s\n' "missing"
    return
  }

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$CONFIG_FILE" | awk '{print substr($1, 1, 16)}'
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$CONFIG_FILE" | awk '{print substr($1, 1, 16)}'
    return
  fi

  wc -c < "$CONFIG_FILE" | tr -d ' '
}

default_profiles() {
  profiles=

  mongo_uri=$(strip_quotes "$(read_config_value mongo.uri)")
  case "$mongo_uri" in
    "" | *//mongo:* | *@mongo:*) profiles=selfhosted ;;
  esac

  if [ -n "$(strip_quotes "$(read_config_value sync.mongoUri)")" ]; then
    profiles="${profiles:+$profiles,}sync"
  fi

  printf '%s\n' "$profiles"
}
