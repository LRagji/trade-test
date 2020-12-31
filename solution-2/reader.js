const fs = require('fs');
const readline = require('readline');
const path = require('path');
const redisType = require("ioredis");
const defaultRedisConnectionString = "redis://127.0.0.1:6379/";
const redisClient = new redisType(defaultRedisConnectionString);
const JSONBigIntNativeParser = require('json-bigint')({ useNativeBigInt: true });
const validationMap = new Map();

//Define command with lua
redisClient.defineCommand("Process", { numberOfKeys: 2, lua: fs.readFileSync(path.join(__dirname, '/lua/compute.lua')) });


const processTradeFiles = async (filePath) => {

    const lineObject = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity
    });

    let timeBegin = Date.now();
    let tradesPerSecondCounter = 0;
    for await (const line of lineObject) {
        const trade = JSONBigIntNativeParser.parse(line);
        let lastProcessedDate = validationMap.get(trade.sym);//Should be moved to redis in case of multi readers enviroment.
        if (lastProcessedDate == null || lastProcessedDate < trade.TS2) {
            const symbolEpochKey = `${trade.sym}-EPOCH`;
            await redisClient.Process(symbolEpochKey, trade.sym, trade.TS2, trade.P, trade.Q);
            validationMap.set(trade.sym, trade.TS2);
        }
        else if (lastProcessedDate >= trade.TS2) {
            console.log(`[SKIPPED] Trade is back dated with respect to ${lastProcessedDate}; Trade => ${line}`);
        }

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
processTradeFiles(path.join(__dirname, '/../test/test.json'))
    .then((a) => {
        console.timeEnd("Processing");
        redisClient.quit();
    });