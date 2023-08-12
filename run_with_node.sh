export EMP_HOME="$HOME/dev/emp";
# export NODE_TLS_REJECT_UNAUTHORIZED=0;
export NODE_EXTRA_CA_CERTS=~/Library/Application\ Support/Caddy/pki/authorities/local/root.crt
export EMP_FRONTEND_URL="https://mtc.localhost";
export EMP_NODE_MODULES="$EMP_HOME/node_modules";
export EMP_CLIENT="$EMP_HOME/src/tools/client";
export EMP_BACKUP="$EMP_HOME/../backup";
export EMP_RUNTIME_FOLDER="$EMP_HOME/../emp_runtime";
export EMP_STATIC_FOLDER="$EMP_HOME/../emp_static";
export EMP_ATTACHMENT_FOLDER="$EMP_HOME/../emp_attachment";
export EMP_KSHARE_FOLDER="$EMP_HOME/../emp_kshare";
unset http_proxy;
unset https_proxy;
unset ALL_PROXY;
node build/index.js
