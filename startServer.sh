export EMP_NODE_MODULES=/Users/lucas/dev/emp/node_modules
export EMP_CLIENT=/Users/lucas/dev/emp/src/tools/client
export EMP_RUNTIME_FOLDER=/Users/lucas/dev/emp_runtime
export EMP_FRONTEND_URL=http://localhost:3000
unset http_proxy;
unset https_proxy;
unset ALL_PROXY;
node server.js --inspect
