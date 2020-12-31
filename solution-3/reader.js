const fs = require('fs');
const readline = require('readline');
const path = require('path');
const redisType = require("ioredis");
const defaultRedisConnectionString = "redis://127.0.0.1:6379/";
const redisClient = new redisType(defaultRedisConnectionString);
const JSONBigIntNativeParser = require('json-bigint')({ useNativeBigInt: true });

//Define command with lua
redisClient.defineCommand("Process", { numberOfKeys: 1, lua: fs.readFileSync(path.join(__dirname, '/lua/compute.lua')) });


const processTradeFiles = async (filePath) => {

    const lineObject = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity
    });

    let timeBegin = Date.now();
    let tradesPerSecondCounter = 0;
    for await (const line of lineObject) {
        const trade = JSONBigIntNativeParser.parse(line);
        await redisClient.Process(trade.sym, trade.TS2, trade.P, trade.Q);
        tradesPerSecondCounter++;
        const elapsed = Date.now() - timeBegin;
        if (elapsed > 1000) {
            console.log(`Trade Procesing Rate: ${((tradesPerSecondCounter / elapsed) * 1000).toFixed(2)}/${(elapsed / 1000).toFixed(2)} second`);
            timeBegin = Date.now();
            tradesPerSecondCounter = 0;
        }
    }
}

console.time("Processing");
processTradeFiles(path.join(__dirname, '/../test/trades.json'))
    .then((a) => {
        console.timeEnd("Processing");
        redisClient.quit();
    });