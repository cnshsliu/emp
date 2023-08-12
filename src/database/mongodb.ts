import { isMainThread } from "worker_threads";
/*jshint node: true */
("use strict");

/**
 * ## Imports
 *
 */
//use mongoose as the ORM
import Mongoose, { ConnectOptions } from "mongoose";
import ServerConfig from "../../secret/keep_secret.js";
const theThread = isMainThread ? "MainThread" : "ChildThread";

/**
 * ## Default the connection string to the development envionment
 *
 */
let connection_string = ServerConfig.mongodb.connectionString;

Mongoose.connection
	.on(
		"open",
		console.info.bind(console, "✅ 🦆", theThread, "connect mongodb success!", connection_string),
	)
	.on("close", console.info.bind(console, "❎ 🦆", theThread, "mongodb disconnected!", ""));

const dbConnect = async () => {
	await Mongoose.connect(connection_string, {
		useUnifiedTopology: true,
		useNewUrlParser: true,
		maxPoolSize: isMainThread ? 100 : 1,
	} as ConnectOptions);
};
//Mongoose.set("useCreateIndex", true);
//Mongoose.set("useFindAndModify", false);
//
export { Mongoose, dbConnect };
