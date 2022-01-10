#!/bin/bash

HOME=/Users/lucas

scp $HOME/dev/emp/modefiles/config_production.js ubuntu@qcserver:/home/ubuntu/dev/emp/src/config/emp.js
ssh -t ubuntu@qcserver "cd /home/ubuntu/dev/emp; cat src/config/emp.js; git pull;"
ssh -t ubuntu@qcserver "/home/ubuntu/.nvm/versions/node/v14.15.3/bin/pm2 status; /home/ubuntu/.nvm/versions/node/v14.15.3/bin/pm2 restart emp_server;"

