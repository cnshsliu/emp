"use strict";

const Crypto = require("../src/lib/Crypto");

if (process.argv.length > 2) {
  let ret = Crypto.decrypt(process.argv[2]);
  console.log(ret);
}
