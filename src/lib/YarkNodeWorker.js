require("../database/mongodb");

const { parentPort, workerData } = require("worker_threads");
const Tools = require("../tools/tools.js");
const Workflow = require("../database/models/Workflow");
const Route = require("../database/models/Route");
const { v4: uuidv4 } = require("uuid");
const { Cheerio, Parser } = require("./Parser");
const Cell = require("../database/models/Cell");
const Cache = require("./Cache");
const CbPoint = require("../database/models/CbPoint");
const DelayTimer = require("../database/models/DelayTimer");
const { Engine } = require("./Engine");

const obj = workerData;

Engine.yarkNode_internal(obj).then((res) => {
  parentPort.postMessage("YarkNodeWorker Worker Done.");
});
