const { isMainThread } = require("worker_threads");
/*jshint node: true */
/**
 * # mongodb.js
 *
 * All the user information will be documents in MongoDB
 *
 * This class sets up the connection depending on the environment
 *
 */
("use strict");

/**
 * ## Imports
 *
 */
//use mongoose as the ORM
const Mongoose = require("mongoose"),
  EmpConfig = require("../config/emp");

/**
 * ## Default the connection string to the development envionment
 *
 */
var connection_string = EmpConfig.mongodb.connectionString;

/**
 * ## Set the connection string for the OpenShift environment
 *
 */
if (process.env.OPENSHIFT_MONGODB_DB_HOST) {
  connection_string =
    process.env.OPENSHIFT_MONGODB_DB_USERNAME +
    ":" +
    process.env.OPENSHIFT_MONGODB_DB_PASSWORD +
    "@" +
    process.env.OPENSHIFT_MONGODB_DB_HOST +
    ":" +
    process.env.OPENSHIFT_MONGODB_DB_PORT +
    "/" +
    process.env.OPENSHIFT_APP_NAME;
}

Mongoose.connection
  .on(
    "open",
    console.info.bind(
      console,
      "\t" + ((isMainThread ? "MainThread" : "ChildThread") + "  Database open")
    )
  )
  .on(
    "close",
    console.info.bind(
      console,
      "\t" + ((isMainThread ? "MainThread" : "ChildThread") + " Database close")
    )
  );

Mongoose.connect(connection_string, {
  useUnifiedTopology: true,
  useNewUrlParser: true,
  maxPoolSize: isMainThread ? 100 : 1,
});
//Mongoose.set("useCreateIndex", true);
//Mongoose.set("useFindAndModify", false);
//
module.exports = { Mongoose };
