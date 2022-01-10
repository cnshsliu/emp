/*jshint node: true */
"use strict";
const { starter } = require("./src/config/hapi");
require("./src/database/mongodb");
const fs = require("fs");

let emp_node_modules = process.env.EMP_NODE_MODULES;
let emp_runtime_folder = process.env.EMP_RUNTIME_FOLDER;
let env_folder_okay = true;
if (!fs.existsSync(emp_node_modules)) {
  console.error(`env.EMP_NODE_MODULES: ${emp_node_modules} does not exists`);
  env_folder_okay = false;
}
if (!fs.existsSync(emp_runtime_folder)) {
  console.error(`env.EMP_RUNTIME_FOLDER: ${emp_runtime_folder} does not exists`);
  env_folder_okay = false;
}

if (env_folder_okay) {
  starter();
} else {
  process.exit(1);
}

process.on("unhandledRejection", (err) => {
  console.log(err);
  process.exit(1);
});
