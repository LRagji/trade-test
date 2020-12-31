const redisType = require("ioredis");
const defaultRedisConnectionString = "redis://127.0.0.1:6379/";
const redisClient = new redisType(defaultRedisConnectionString);
const redisClientFetch = new redisType(defaultRedisConnectionString);
redisClient.config("SET", "notify-keyspace-events", "Ex")
redisClient.subscribe("__keyevent@0__:expired");
redisClient.on("message", (channel, message) => {
    const key = message.substring(0, message.length - 2);
    redisClientFetch.hgetall(key, (err, data) => processBar(key, err, data));
});

function processBar(key, err, data) {
    const symbol = key.split("-")[0];
    if (err == undefined) {
        const transformedBar = { "o": data.F, "h": data.H, "l": data.L, "c": data.C, "volume": data.V, "event": "ohlc_notify", "symbol": symbol, "bar_num": data.B };
        console.log(transformedBar);
        redisClientFetch.del(key);
    }
    else {
        console.error(err);
    }
}