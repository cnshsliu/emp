"use strict";
import { createClient } from "redis";
import ServerConfig from "../../secret/keep_secret";

const redisClient = createClient({
  url: ServerConfig.redis.connectionString,
});
setTimeout(async () => await redisClient.connect());

redisClient.on("error", (err) => {
  console.log("Redis Client Error", err);
});

export default redisClient;
