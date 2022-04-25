const { parentPort, workerData } = require("worker_threads");
const { Engine } = require("../Engine");
const { Mongoose } = require("../../database/mongodb");

const workerLog = (msg) => {
  parentPort.postMessage({ cmd: "worker_log", msg: msg });
};
const obj = workerData;

Engine.yarkNode_internal(obj).then((res) => {
  Mongoose.connection.close();
  parentPort.postMessage("YarkNodeWorker Worker Done.");
});
