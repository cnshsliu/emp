/*jshint node: true */
"use strict";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import HapiServer from "./config/hapi";
import { Mongoose, dbConnect } from "./database/mongodb";
import { redisConnect } from "./database/redis";

dbConnect().then(() => {
	redisConnect().then(() => {
		HapiServer.starter();
	});
});
