/*jshint node: true */
"use strict";
import HapiServer from "./config/hapi";
import { Mongoose, dbConnect } from "./database/mongodb";
import { redisConnect } from "./database/redis";

dbConnect().then(() => {
	redisConnect().then(() => {
		HapiServer.starter();
	});
});
