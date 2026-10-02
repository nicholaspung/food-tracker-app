#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="$ROOT_DIR/.github/workflows/deploy.yml"
POLICY_WORKFLOW="$ROOT_DIR/.github/workflows/action-reference-policy.yml"
DEPLOY_SCRIPT="$ROOT_DIR/scripts/deploy.sh"
SETUP_SCRIPT="$ROOT_DIR/scripts/setup-deploy-sudo.sh"

fail() {
    echo "Production deployment provenance check failed: $*" >&2
    exit 1
}

require_text() {
    local path="$1"
    local text="$2"
    rg -Fq -- "$text" "$path" || fail "$path is missing: $text"
}

require_text "$WORKFLOW" 'APPROVED_SHA: ${{ github.sha }}'
require_text "$WORKFLOW" "printf '%s\\n' \"\$APPROVED_SHA\" | timeout 30m ssh"
require_text "$WORKFLOW" '-o ServerAliveInterval=30'
require_text "$WORKFLOW" '-o ServerAliveCountMax=6'

[ "$(rg -Fc -- '      - ".gitignore"' "$POLICY_WORKFLOW")" -eq 2 ] || fail ".gitignore changes do not trigger the deployment policy"

if rg -n '\bgit (fetch|pull|reset|checkout)\b' "$DEPLOY_SCRIPT" >/dev/null; then
    fail "deploy.sh must verify source and must not select or update it"
fi

require_text "$DEPLOY_SCRIPT" 'verify_approved_source'
require_text "$DEPLOY_SCRIPT" 'deployment_digest=sha256:%s'
require_text "$DEPLOY_SCRIPT" 'Rollback target: commit'
require_text "$SETUP_SCRIPT" 'mkdir -p "$BACKUP_DIRECTORY"'
require_text "$SETUP_SCRIPT" 'chown -R "$DEPLOY_USER:$DEPLOY_USER" "$BACKUP_DIRECTORY"'
require_text "$SETUP_SCRIPT" 'chmod 0700 "$BACKUP_DIRECTORY"'

for runtime_build in marketing_build app_build admin_build; do
    git -C "$ROOT_DIR" check-ignore -q "$runtime_build/example" || fail "$runtime_build is not protected from launcher cleanup"
done

launcher_template=$(mktemp)
test_root=$(mktemp -d)
cleanup() {
    rm -f "$launcher_template"
    rm -rf "$test_root"
}
trap cleanup EXIT

awk '
    /^cat > "\$PRODUCTION_LAUNCHER"/ { capture = 1; next }
    capture && $0 == "EOF" { exit }
    capture { print }
' "$SETUP_SCRIPT" > "$launcher_template"

[ -s "$launcher_template" ] || fail "could not extract the Production launcher"
require_text "$launcher_template" 'git fetch --no-tags origin "$approved_sha"'
require_text "$launcher_template" 'git restore --source="$approved_sha" --worktree -- .'
require_text "$launcher_template" 'git update-ref --no-deref HEAD "$approved_sha"'
require_text "$launcher_template" 'if [ "$actual_sha" != "$approved_sha" ]'

remote="$test_root/remote.git"
source_repo="$test_root/source"
checkout="$test_root/checkout"
deploy_env="$test_root/deploy.env"
deploy_record="$test_root/deploy-record"
launcher="$test_root/production-launcher"
lock_file="$test_root/production.lock"
pause_started="$test_root/pause-started"
pause_release="$test_root/pause-release"
launcher_provenance="$test_root/launcher-backups/production/current-provenance.env"
fake_bin="$test_root/fake-bin"
seeded_image="sha256:$(printf 'b%.0s' {1..64})"
real_git=$(command -v git)
mkdir -p "$fake_bin"
printf '%s\n' \
    '#!/usr/bin/env bash' \
    'if [ "${1:-}" = inspect ]; then' \
    "    printf '%s\\n' '$seeded_image'" \
    '    exit 0' \
    'fi' \
    'exit 1' \
    > "$fake_bin/docker"
chmod +x "$fake_bin/docker"

git init --bare "$remote" >/dev/null
git init -b main "$source_repo" >/dev/null
git -C "$source_repo" config user.email provenance-test@example.com
git -C "$source_repo" config user.name 'Provenance Test'
mkdir -p "$source_repo/scripts" "$source_repo/backend/hooks"
printf '%s\n' \
    '#!/usr/bin/env bash' \
    'cleanup() { rm -f "$DEPLOY_TEST_LOCK_FILE"; }' \
    'trap cleanup EXIT' \
    'if [ -n "${DEPLOY_PAUSE_STARTED:-}" ]; then' \
    '    : > "$DEPLOY_PAUSE_STARTED"' \
    '    while [ ! -e "$DEPLOY_PAUSE_RELEASE" ]; do sleep 0.05; done' \
    'fi' \
    'printf "%s\n%s\n%s\n%s\n" "$FOOD_TRACKER_DEPLOY_SHA" "$(git rev-parse HEAD)" "$(cat backend/pb_hooks/content.txt)" "$(cat "$FOOD_TRACKER_BACKEND_MOUNT_STAGING/live/backend/pb_hooks/content.txt")" > "$DEPLOY_RECORD"' \
    'printf "%s\n" "${FOOD_TRACKER_POCKETBASE_USER:-missing}" >> "$DEPLOY_RECORD"' \
    'rm -rf "$FOOD_TRACKER_BACKEND_MOUNT_STAGING"' \
    > "$source_repo/scripts/deploy.sh"
printf '%s\n' '/marketing_build*/' '/app_build*/' '/admin_build*/' > "$source_repo/.gitignore"
printf 'commit-a\n' > "$source_repo/version.txt"
printf 'source-a\n' > "$source_repo/backend/hooks/version.txt"
git -C "$source_repo" add .gitignore scripts/deploy.sh version.txt backend/hooks/version.txt
git -C "$source_repo" commit -m 'Commit A' >/dev/null
sha_a=$(git -C "$source_repo" rev-parse HEAD)
git -C "$source_repo" remote add origin "$remote"
git -C "$source_repo" push -u origin main >/dev/null

printf 'commit-b\n' > "$source_repo/version.txt"
printf 'source-b\n' > "$source_repo/backend/hooks/version.txt"
git -C "$source_repo" commit -am 'Commit B' >/dev/null
sha_b=$(git -C "$source_repo" rev-parse HEAD)
git -C "$source_repo" push origin main >/dev/null
git --git-dir="$remote" symbolic-ref HEAD refs/heads/main
git clone "$remote" "$checkout" >/dev/null
mkdir -p "$checkout/marketing_build" "$checkout/app_build" "$checkout/admin_build"
printf 'live\n' > "$checkout/marketing_build/index.html"
printf 'live\n' > "$checkout/app_build/index.html"
printf 'live\n' > "$checkout/admin_build/index.html"
for mount_dir in pb_migrations pb_hooks pb_public; do
    mkdir -p "$checkout/backend/$mount_dir"
    printf 'server-runtime-%s\n' "$mount_dir" > "$checkout/backend/$mount_dir/content.txt"
done

printf 'DEPLOY_RECORD=%q\nDEPLOY_TEST_LOCK_FILE=%q\nPATH=%q\n' \
    "$deploy_record" "$lock_file" "$fake_bin:$PATH" > "$deploy_env"
sed \
    -e "s|readonly APP_DIRECTORY=.*|readonly APP_DIRECTORY=\"$checkout\"|" \
    -e "s|readonly DEPLOY_ENV_FILE=.*|readonly DEPLOY_ENV_FILE=\"$deploy_env\"|" \
    -e "s|readonly LOCK_FILE=.*|readonly LOCK_FILE=\"$lock_file\"|" \
    -e "s|readonly PROVENANCE_FILE=.*|readonly PROVENANCE_FILE=\"$launcher_provenance\"|" \
    "$launcher_template" > "$launcher"
chmod +x "$launcher"
printf 'FOOD_TRACKER_POCKETBASE_USER=0:0\n' >> "$deploy_env"

if printf '%s\n' "$sha_a" | SSH_ORIGINAL_COMMAND='' bash "$launcher" >/dev/null 2>&1; then
    fail "launcher accepted a Production deploy without provisioned backup storage"
fi
[ ! -e "$deploy_record" ] || fail "missing backup storage executed repository deploy code"
mkdir -p "$(dirname "$launcher_provenance")"
chmod 700 "$(dirname "$launcher_provenance")"

printf '%s\n' "$sha_a" | SSH_ORIGINAL_COMMAND='' bash "$launcher" >/dev/null
selected_approved=$(sed -n '1p' "$deploy_record")
selected_actual=$(sed -n '2p' "$deploy_record")
live_mount_at_boundary=$(sed -n '3p' "$deploy_record")
approved_mount_at_boundary=$(sed -n '4p' "$deploy_record")
[ "$selected_approved" = "$sha_a" ] || fail "launcher did not pass approved commit A"
[ "$selected_actual" = "$sha_a" ] || fail "launcher deployed mutable main instead of commit A"
selected_container_user=$(sed -n '5p' "$deploy_record")
[ "$selected_container_user" = "$(id -u):$(id -g)" ] || fail "launcher did not bind the container identity to its host account"
[ "$live_mount_at_boundary" = "server-runtime-pb_hooks" ] || fail "launcher changed the live backend mount before the deploy boundary"
[ "$approved_mount_at_boundary" = "server-runtime-pb_hooks" ] || fail "launcher did not preserve the untracked backend runtime mount"
seeded_sha=$(awk -F= '$1 == "approved_sha" { print $2; exit }' "$launcher_provenance")
seeded_backend=$(awk -F= '$1 == "backend_image" { print $2; exit }' "$launcher_provenance")
[ "$seeded_sha" = "$sha_b" ] || fail "launcher did not seed the previously live commit before checkout"
[ "$seeded_backend" = "$seeded_image" ] || fail "launcher did not seed the previously live backend image"
[ -f "$checkout/marketing_build/index.html" ] || fail "launcher cleanup removed the live marketing build"
[ -f "$checkout/app_build/index.html" ] || fail "launcher cleanup removed the live app build"
[ -f "$checkout/admin_build/index.html" ] || fail "launcher cleanup removed the live admin build"
if git -C "$checkout" symbolic-ref -q HEAD >/dev/null; then
    fail "launcher did not leave the approved commit detached"
fi

reject_without_deploying() {
    local label="$1"
    shift
    rm -f "$deploy_record"
    if "$@" >/dev/null 2>&1; then
        fail "$label was accepted"
    fi
    [ ! -e "$deploy_record" ] || fail "$label executed repository deploy code"
}

reject_without_deploying "missing SHA" bash -c ": | SSH_ORIGINAL_COMMAND='' bash '$launcher'"
reject_without_deploying "malformed SHA" bash -c "printf '%s\\n' main | SSH_ORIGINAL_COMMAND='' bash '$launcher'"
reject_without_deploying "unreachable SHA" bash -c "printf '%s\\n' ffffffffffffffffffffffffffffffffffffffff | SSH_ORIGINAL_COMMAND='' bash '$launcher'"
reject_without_deploying "extra stdin" bash -c "printf '%s\\n' '$sha_b' extra | SSH_ORIGINAL_COMMAND='' bash '$launcher'"
reject_without_deploying "remote command" bash -c "printf '%s\\n' '$sha_b' | SSH_ORIGINAL_COMMAND='deploy $sha_b' bash '$launcher'"

printf '%s\n' \
    '#!/usr/bin/env bash' \
    'if [ "${1:-}" = rev-parse ] && [ "${2:-}" = HEAD ]; then' \
    '    printf "0000000000000000000000000000000000000000\n"' \
    '    exit 0' \
    'fi' \
    "exec '$real_git' \"\$@\"" \
    > "$fake_bin/git"
chmod +x "$fake_bin/git"
reject_without_deploying "checkout mismatch" bash -c "printf '%s\\n' '$sha_b' | PATH='$fake_bin':\"\$PATH\" SSH_ORIGINAL_COMMAND='' bash '$launcher'"
rm -f "$fake_bin/git"

printf '%s\n' "$sha_b" | SSH_ORIGINAL_COMMAND='' bash "$launcher" >/dev/null
selected_approved=$(sed -n '1p' "$deploy_record")
selected_actual=$(sed -n '2p' "$deploy_record")
[ "$selected_approved" = "$sha_b" ] || fail "launcher rejected legitimate commit B"
[ "$selected_actual" = "$sha_b" ] || fail "launcher did not deploy legitimate commit B"

printf 'DEPLOY_RECORD=%q\nDEPLOY_TEST_LOCK_FILE=%q\nDEPLOY_PAUSE_STARTED=%q\nDEPLOY_PAUSE_RELEASE=%q\nPATH=%q\n' \
    "$deploy_record" "$lock_file" "$pause_started" "$pause_release" "$fake_bin:$PATH" > "$deploy_env"
rm -f "$deploy_record" "$pause_started" "$pause_release"
printf '%s\n' "$sha_a" | SSH_ORIGINAL_COMMAND='' bash "$launcher" >/dev/null &
first_pid=$!
for _attempt in 1 2 3 4 5 6 7 8 9 10; do
    [ -e "$pause_started" ] && break
    sleep 0.1
done
[ -e "$pause_started" ] || fail "concurrency fixture did not reach the deploy boundary"
reject_without_deploying "concurrent Production deploy" bash -c "printf '%s\\n' '$sha_b' | SSH_ORIGINAL_COMMAND='' bash '$launcher'"
touch "$pause_release"
wait "$first_pid"
selected_approved=$(sed -n '1p' "$deploy_record")
selected_actual=$(sed -n '2p' "$deploy_record")
[ "$selected_approved" = "$sha_a" ] || fail "concurrent run replaced approved commit A"
[ "$selected_actual" = "$sha_a" ] || fail "concurrent run changed commit A before deployment"

rollback_root="$test_root/rollback"
rollback_app="$rollback_root/app"
rollback_backups="$rollback_root/backups"
rollback_snapshot="$rollback_backups/snapshot"
rollback_docker_calls="$rollback_root/docker-calls"
mkdir -p "$rollback_app/backend" "$rollback_snapshot/backend-runtime"
for build_dir in marketing_build app_build admin_build; do
    mkdir -p "$rollback_app/$build_dir" "$rollback_app/${build_dir}_old" "$rollback_snapshot/$build_dir"
    printf 'new-%s\n' "$build_dir" > "$rollback_app/$build_dir/index.html"
    printf 'stale-%s\n' "$build_dir" > "$rollback_app/${build_dir}_old/index.html"
    printf 'old-%s\n' "$build_dir" > "$rollback_snapshot/$build_dir/index.html"
done
for mount_dir in pb_migrations pb_hooks pb_public; do
    mkdir -p "$rollback_app/backend/$mount_dir" "$rollback_snapshot/backend-runtime/$mount_dir"
    printf 'new-%s\n' "$mount_dir" > "$rollback_app/backend/$mount_dir/content.txt"
    printf 'old-%s\n' "$mount_dir" > "$rollback_snapshot/backend-runtime/$mount_dir/content.txt"
done
printf '%s\n' \
    'services:' \
    '  pocketbase:' \
    '    image: food-tracker-pocketbase:latest' \
    > "$rollback_snapshot/docker-compose.yml"
cp "$rollback_snapshot/docker-compose.yml" "$rollback_app/docker-compose.yml"
ln -s "$rollback_snapshot" "$rollback_backups/latest"

expected_static_digest=$(for build_dir in marketing_build app_build admin_build; do
    find "$rollback_snapshot/$build_dir" -type f -print
done | LC_ALL=C sort | while IFS= read -r artifact_path; do
    relative_path="${artifact_path#"$rollback_snapshot"/}"
    printf '%s  %s\n' "$(sha256sum "$artifact_path" | awk '{print $1}')" "$relative_path"
done | sha256sum | awk '{print $1}')

rollback_sha=1111111111111111111111111111111111111111
rollback_image="sha256:$(printf 'a%.0s' {1..64})"
expected_backend_mount_digest=$(for mount_dir in pb_migrations pb_hooks pb_public; do
    find "$rollback_snapshot/backend-runtime/$mount_dir" -type f -print
done | LC_ALL=C sort | while IFS= read -r artifact_path; do
    relative_path="${artifact_path#"$rollback_snapshot/backend-runtime"/}"
    printf '%s  %s\n' "$(sha256sum "$artifact_path" | awk '{print $1}')" "$relative_path"
done | sha256sum | awk '{print $1}')
rollback_digest=$(printf 'approved_sha=%s\nstatic_sha256=%s\nbackend_mount_sha256=%s\nbackend_image=%s\n' \
    "$rollback_sha" "$expected_static_digest" "$expected_backend_mount_digest" "$rollback_image" | sha256sum | awk '{print $1}')
{
    printf 'approved_sha=%s\n' "$rollback_sha"
    printf 'deployment_digest=sha256:%s\n' "$rollback_digest"
    printf 'static_digest=sha256:%s\n' "$expected_static_digest"
    printf 'backend_mount_digest=sha256:%s\n' "$expected_backend_mount_digest"
    printf 'backend_image=%s\n' "$rollback_image"
    printf 'deployed_at=2026-08-25T00:00:00Z\n'
} > "$rollback_snapshot/deployment-provenance.env"

(
    export FOOD_TRACKER_APP_DIR="$rollback_app"
    export FOOD_TRACKER_DEPLOY_SHA="$rollback_sha"
    # shellcheck disable=SC1090 -- this sources the issue-scoped script under test.
    source "$DEPLOY_SCRIPT"
    BACKUP_DIR="$rollback_backups"
    PROVENANCE_FILE="$rollback_backups/current-provenance.env"
    LOG_FILE="$rollback_root/rollback.log"

    run_sudo() { return 0; }
    log() { return 0; }
    warn() { return 0; }
    error() { return 0; }
    docker() {
        printf '%s\n' "$*" >> "$rollback_docker_calls"
        if [ "${1:-}" = compose ] && [[ " $* " == *" config --images "* ]]; then
            printf 'food-tracker-pocketbase:latest\n'
        elif [ "${1:-}" = compose ] && [[ " $* " == *" down pocketbase "* ]]; then
            [ "$(cat "$rollback_app/backend/pb_hooks/content.txt")" = "new-pb_hooks" ] || return 1
        elif [ "${1:-}" = compose ] && [[ " $* " == *" up -d --no-build pocketbase "* ]]; then
            [ "$(cat "$rollback_app/backend/pb_hooks/content.txt")" = "old-pb_hooks" ] || return 1
        elif [ "${1:-}" = inspect ]; then
            printf '%s\n' "$rollback_image"
        fi
        return 0
    }

    rollback
)

cmp -s "$rollback_snapshot/deployment-provenance.env" "$rollback_backups/current-provenance.env" || \
    fail "rollback restored provenance without verifying the saved artifact"
for build_dir in marketing_build app_build admin_build; do
    expected_content="old-$build_dir"
    actual_content=$(sed -n '1p' "$rollback_app/$build_dir/index.html")
    [ "$actual_content" = "$expected_content" ] || fail "rollback did not restore $build_dir"
    stale_content=$(sed -n '1p' "$rollback_app/${build_dir}_old/index.html")
    [ "$stale_content" = "stale-$build_dir" ] || fail "rollback consumed transient ${build_dir}_old instead of the immutable backup"
done
for mount_dir in pb_migrations pb_hooks pb_public; do
    actual_content=$(sed -n '1p' "$rollback_app/backend/$mount_dir/content.txt")
    [ "$actual_content" = "old-$mount_dir" ] || fail "rollback did not restore backend/$mount_dir"
done
require_text "$rollback_docker_calls" "image tag $rollback_image food-tracker-pocketbase:latest"
require_text "$rollback_docker_calls" "compose --project-directory $rollback_app -f $rollback_backups/latest/docker-compose.yml down pocketbase"
require_text "$rollback_docker_calls" 'compose -f docker-compose.yml up -d --no-build pocketbase'
require_text "$rollback_docker_calls" "inspect --format {{.Image}} pocketbase"

missing_root="$test_root/missing-image-rollback"
missing_app="$missing_root/app"
missing_backups="$missing_root/backups"
missing_snapshot="$missing_backups/snapshot"
mkdir -p "$missing_app" "$missing_backups"
cp -R "$rollback_snapshot" "$missing_snapshot"
ln -s "$missing_snapshot" "$missing_backups/latest"
cp "$missing_snapshot/docker-compose.yml" "$missing_app/docker-compose.yml"
for build_dir in marketing_build app_build admin_build; do
    mkdir -p "$missing_app/$build_dir" "$missing_app/${build_dir}_old"
    printf 'current-%s\n' "$build_dir" > "$missing_app/$build_dir/index.html"
    printf 'rollback-%s\n' "$build_dir" > "$missing_app/${build_dir}_old/index.html"
done

(
    export FOOD_TRACKER_APP_DIR="$missing_app"
    export FOOD_TRACKER_DEPLOY_SHA="$rollback_sha"
    # shellcheck disable=SC1090 -- this sources the issue-scoped script under test.
    source "$DEPLOY_SCRIPT"
    BACKUP_DIR="$missing_backups"
    PROVENANCE_FILE="$missing_backups/current-provenance.env"
    LOG_FILE="$missing_root/rollback.log"

    log() { return 0; }
    warn() { return 0; }
    error() { return 0; }
    docker() {
        if [ "${1:-}" = image ] && [ "${2:-}" = inspect ]; then
            return 1
        fi
        return 0
    }

    if rollback; then
        exit 1
    fi
)

for build_dir in marketing_build app_build admin_build; do
    current_content=$(sed -n '1p' "$missing_app/$build_dir/index.html")
    rollback_content=$(sed -n '1p' "$missing_app/${build_dir}_old/index.html")
    [ "$current_content" = "current-$build_dir" ] || fail "missing rollback image mutated $build_dir"
    [ "$rollback_content" = "rollback-$build_dir" ] || fail "missing rollback image consumed ${build_dir}_old"
done
[ ! -e "$missing_backups/current-provenance.env" ] || fail "missing rollback image restored stale provenance"

printf 'corrupt-static\n' > "$missing_snapshot/marketing_build/index.html"

(
    export FOOD_TRACKER_APP_DIR="$missing_app"
    export FOOD_TRACKER_DEPLOY_SHA="$rollback_sha"
    # shellcheck disable=SC1090 -- this sources the issue-scoped script under test.
    source "$DEPLOY_SCRIPT"
    BACKUP_DIR="$missing_backups"
    PROVENANCE_FILE="$missing_backups/current-provenance.env"
    LOG_FILE="$missing_root/corrupt-static.log"

    log() { return 0; }
    warn() { return 0; }
    error() { return 0; }
    docker() {
        if [ "${1:-}" = compose ] && [[ " $* " == *" config --images "* ]]; then
            printf 'food-tracker-pocketbase:latest\n'
        fi
        return 0
    }

    if rollback; then
        exit 1
    fi
)

for build_dir in marketing_build app_build admin_build; do
    current_content=$(sed -n '1p' "$missing_app/$build_dir/index.html")
    rollback_content=$(sed -n '1p' "$missing_app/${build_dir}_old/index.html")
    [ "$current_content" = "current-$build_dir" ] || fail "corrupt rollback source mutated $build_dir"
    [ "$rollback_content" = "rollback-$build_dir" ] || fail "corrupt rollback source consumed ${build_dir}_old"
done

corrupt_mount_root="$test_root/corrupt-mount-rollback"
corrupt_mount_app="$corrupt_mount_root/app"
corrupt_mount_backups="$corrupt_mount_root/backups"
corrupt_mount_snapshot="$corrupt_mount_backups/snapshot"
mkdir -p "$corrupt_mount_app/backend" "$corrupt_mount_backups"
cp -R "$rollback_snapshot" "$corrupt_mount_snapshot"
ln -s "$corrupt_mount_snapshot" "$corrupt_mount_backups/latest"
printf 'corrupt\n' > "$corrupt_mount_snapshot/backend-runtime/pb_hooks/content.txt"
cp "$corrupt_mount_snapshot/docker-compose.yml" "$corrupt_mount_app/docker-compose.yml"
for build_dir in marketing_build app_build admin_build; do
    mkdir -p "$corrupt_mount_app/$build_dir" "$corrupt_mount_app/${build_dir}_old"
    printf 'current-%s\n' "$build_dir" > "$corrupt_mount_app/$build_dir/index.html"
    printf 'rollback-%s\n' "$build_dir" > "$corrupt_mount_app/${build_dir}_old/index.html"
done
for mount_dir in pb_migrations pb_hooks pb_public; do
    mkdir -p "$corrupt_mount_app/backend/$mount_dir"
    printf 'current-%s\n' "$mount_dir" > "$corrupt_mount_app/backend/$mount_dir/content.txt"
done

(
    export FOOD_TRACKER_APP_DIR="$corrupt_mount_app"
    export FOOD_TRACKER_DEPLOY_SHA="$rollback_sha"
    # shellcheck disable=SC1090 -- this sources the issue-scoped script under test.
    source "$DEPLOY_SCRIPT"
    BACKUP_DIR="$corrupt_mount_backups"
    PROVENANCE_FILE="$corrupt_mount_backups/current-provenance.env"
    LOG_FILE="$corrupt_mount_root/rollback.log"
    log() { return 0; }
    warn() { return 0; }
    error() { return 0; }
    docker() {
        if [ "${1:-}" = compose ] && [[ " $* " == *" config --images "* ]]; then
            printf 'food-tracker-pocketbase:latest\n'
        fi
        return 0
    }
    if rollback; then
        exit 1
    fi
)

for build_dir in marketing_build app_build admin_build; do
    current_content=$(sed -n '1p' "$corrupt_mount_app/$build_dir/index.html")
    [ "$current_content" = "current-$build_dir" ] || fail "corrupt backend rollback mutated $build_dir"
done
for mount_dir in pb_migrations pb_hooks pb_public; do
    current_content=$(sed -n '1p' "$corrupt_mount_app/backend/$mount_dir/content.txt")
    [ "$current_content" = "current-$mount_dir" ] || fail "corrupt backend rollback mutated backend/$mount_dir"
done

unseeded_root="$test_root/unseeded-rollback"
unseeded_app="$unseeded_root/app"
unseeded_backups="$unseeded_root/backups"
mkdir -p "$unseeded_app" "$unseeded_backups/snapshot"
ln -s "$unseeded_backups/snapshot" "$unseeded_backups/latest"
for build_dir in marketing_build app_build admin_build; do
    mkdir -p "$unseeded_app/$build_dir" "$unseeded_app/${build_dir}_old"
    printf 'current-%s\n' "$build_dir" > "$unseeded_app/$build_dir/index.html"
    printf 'rollback-%s\n' "$build_dir" > "$unseeded_app/${build_dir}_old/index.html"
done

(
    export FOOD_TRACKER_APP_DIR="$unseeded_app"
    export FOOD_TRACKER_DEPLOY_SHA="$rollback_sha"
    # shellcheck disable=SC1090 -- this sources the issue-scoped script under test.
    source "$DEPLOY_SCRIPT"
    BACKUP_DIR="$unseeded_backups"
    PROVENANCE_FILE="$unseeded_backups/current-provenance.env"
    LOG_FILE="$unseeded_root/rollback.log"
    log() { return 0; }
    warn() { return 0; }
    error() { return 0; }
    if rollback; then
        exit 1
    fi
)

for build_dir in marketing_build app_build admin_build; do
    current_content=$(sed -n '1p' "$unseeded_app/$build_dir/index.html")
    rollback_content=$(sed -n '1p' "$unseeded_app/${build_dir}_old/index.html")
    [ "$current_content" = "current-$build_dir" ] || fail "unseeded Production rollback mutated $build_dir"
    [ "$rollback_content" = "rollback-$build_dir" ] || fail "unseeded Production rollback consumed ${build_dir}_old"
done

web_test_root="$test_root/web-build"
mkdir -p "$web_test_root/app"
cat > "$web_test_root/check.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
export FOOD_TRACKER_APP_DIR="$WEB_TEST_ROOT/app"
export FOOD_TRACKER_DEPLOY_SHA="$WEB_TEST_SHA"
source "$WEB_TEST_DEPLOY_SCRIPT"
LOG_FILE="$WEB_TEST_ROOT/build.log"
step() { return 0; }
log() { return 0; }
run_pnpm() {
    printf '%s\n' "$*" >> "$WEB_TEST_ROOT/commands"
    [ "${CI:-}" = true ] || exit 90
    [ "${NODE_OPTIONS:-}" = "$WEB_TEST_NODE_OPTIONS" ] || exit 91
    if [ "$*" = '--filter @food-tracker/admin build' ]; then
        echo "admin build output"
        [ "$WEB_TEST_FAILURE" != admin ] || return 17
    elif [ "$*" = '--filter @food-tracker/mobile exec expo export --platform web --output-dir web-dist --clear --max-workers 1' ]; then
        [ "${EXPO_NO_DOTENV:-}" = 1 ] || exit 92
        echo "Expo build output" >&2
        [ "$WEB_TEST_FAILURE" != expo ] || return 23
    else
        exit 93
    fi
}
verify_mobile_web_bundle_environment() {
    touch "$WEB_TEST_ROOT/verified"
}
build_web_surfaces
EOF

export WEB_TEST_ROOT="$web_test_root"
export WEB_TEST_SHA="$rollback_sha"
export WEB_TEST_DEPLOY_SCRIPT="$DEPLOY_SCRIPT"
export WEB_TEST_FAILURE=none
export WEB_TEST_NODE_OPTIONS=--max-old-space-size=512
env -u NODE_OPTIONS bash "$web_test_root/check.sh"
test -f "$web_test_root/verified" || fail "successful web build was not verified"
require_text "$web_test_root/build.log" 'admin build output'
require_text "$web_test_root/build.log" 'Expo build output'

export WEB_TEST_NODE_OPTIONS=--max-old-space-size=768
NODE_OPTIONS="$WEB_TEST_NODE_OPTIONS" bash "$web_test_root/check.sh"

for failed_build in admin expo; do
    rm -f "$web_test_root/commands" "$web_test_root/verified"
    export WEB_TEST_FAILURE="$failed_build"
    if NODE_OPTIONS="$WEB_TEST_NODE_OPTIONS" bash "$web_test_root/check.sh"; then
        fail "$failed_build build failure was swallowed by logging"
    else
        failure_status=$?
    fi
    if [ "$failed_build" = admin ]; then
        [ "$failure_status" -eq 17 ] || fail "admin build failure status was lost"
        [ "$(wc -l < "$web_test_root/commands" | tr -d ' ')" -eq 1 ] || fail "Expo ran after admin build failure"
    else
        [ "$failure_status" -eq 23 ] || fail "Expo build failure status was lost"
    fi
    test ! -f "$web_test_root/verified" || fail "failed web build was verified"
done

preflight_test_root="$test_root/preflight"
mkdir -p "$preflight_test_root/app"
cat > "$preflight_test_root/check.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
export FOOD_TRACKER_APP_DIR="$PREFLIGHT_TEST_ROOT/app"
source "$PREFLIGHT_TEST_DEPLOY_SCRIPT"
LOCK_FILE="$PREFLIGHT_TEST_ROOT/deploy.lock"
trap 'rm -f "$LOCK_FILE"' EXIT
warn() { return 0; }
step() { return 0; }
log() { return 0; }
error() { echo "$*" >&2; }
configure_package_manager() { return 0; }
run_pnpm() { echo '11.5.3'; }
systemctl() { return 0; }
df() { printf 'Filesystem Blocks Used Available Capacity Mounted\nfixture 4000000 1000000 3000000 25%% /\n'; }
recover_interrupted_caddy_cutover() { return 0; }
ensure_live_caddy_config() { return 0; }
docker() {
    case "$*" in
        'compose version') return 0 ;;
        'inspect --format {{.State.Running}} pocketbase')
            printf '%s\n' "$PREFLIGHT_TEST_RUNNING"
            ;;
        *) echo "Unexpected Docker command: $*" >&2; exit 92 ;;
    esac
}
preflight_checks
EOF
export PREFLIGHT_TEST_ROOT="$preflight_test_root"
export PREFLIGHT_TEST_DEPLOY_SCRIPT="$DEPLOY_SCRIPT"
PREFLIGHT_TEST_RUNNING=true bash "$preflight_test_root/check.sh"
for running_state in false ''; do
    if PREFLIGHT_TEST_RUNNING="$running_state" bash "$preflight_test_root/check.sh"; then
        fail "Production preflight accepted a stopped or missing exact container"
    fi
done

echo "Production deployment provenance checks passed."
