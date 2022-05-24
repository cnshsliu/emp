import { parentPort, workerData } from "worker_threads";
import Engine from "../Engine";
import { Mongoose, dbConnect } from "../../database/mongodb";

dbConnect();

const workerLog = (msg) => {
	parentPort.postMessage({ cmd: "worker_log", msg: msg });
};

Engine.replaceUser_child(workerData).then((res) => {
	Mongoose.connection.close();
	parentPort.postMessage("YarkNodeWorker Worker Done.");
});
