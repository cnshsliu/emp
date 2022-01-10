"use strict";

const {Cheerio, Parser} = require("../src/lib/Parser");
const Tools = require("../src/tools/tools");
const SDK = require("../src/tools/client");

const TEST_USER = process.env.TEST_USER || TEST_USER;
const TEST_PASSWORD = process.env.TEST_PASSWORD || "password";




const Download = async function (tpl_id) {
  SDK.setServer("http://localhost:5008");
  const ret = await SDK.login(TEST_USER, TEST_PASSWORD);

  let tpl = await SDK.downloadTemplate(tpl_id);
  console.log(tpl.doc);
}


if (process.argv.length > 2) {
  Download(process.argv[2]).then(() => {
  });
}

