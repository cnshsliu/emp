/*jshint node: true */
"use strict";
import HapiServer from "./config/hapi";
import { Mongoose, dbConnect } from "./database/mongodb";

dbConnect();
HapiServer.starter();
