/**
 * # redis.js
 *
 * This is the configuration for Redis
 *
 */
"use strict";
/**
 * ## Imports
 *
 *
 */
const Redis = require("redis"),
  asyncRedis = require("async-redis"),
  EmpConfig = require("../../secret/emp_secret");
var redisClient = {},
  asyncRedisClient = {};
/**
 * ## The connect string for the dev environment
 *
 */
const connection_string = EmpConfig.redis;
/**
 *
 * ## The connect string for the OpenShift env
 *
 */
if (process.env.OPENSHIFT_REDIS_DB_HOST) {
  //The redis env variables on openshift
  connection_string.host = process.env.OPENSHIFT_REDIS_DB_HOST;
  connection_string.port = process.env.OPENSHIFT_REDIS_DB_PORT;

  //connect to Redis
  redisClient = Redis.createClient(connection_string);

  //have to authenticate
  redisClient.auth(process.env.OPENSHIFT_REDIS_DB_PASSWORD);

  asyncRedisClient = asyncRedis.decorate(redisClient);
} else {
  //running locally - make sure you've started redis server
  redisClient = Redis.createClient(connection_string);
  asyncRedisClient = asyncRedis.decorate(redisClient);
}

module.exports = { redisClient, asyncRedisClient };
