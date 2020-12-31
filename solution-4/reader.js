const fs = require('fs');
const readline = require('readline');
const path = require('path');
const redisType = require("ioredis");
const symbolEpochMap = new Map();
const defaultRedisConnectionString = "redis://127.0.0.1:6379/";
const redisClient = new redisType(defaultRedisConnectionString);
const JSONBigIntNativeParser = require('json-bigint')({ useNativeBigInt: true });
const barWidth = 15000000000n;
const barNumberStartPoint = 1n;
const dataHoldingTime = (barWidth / (1000000000n)) * 3n;
const streamPublishKey = 'SINK';
const streamLength = 10000;


async function getEpoch(trade) {
    let symbolEpoch = symbolEpochMap.get(trade.sym);
    if (symbolEpoch == null) {
        const symbolEpochKey = `${trade.sym}-EPOCH`;
        symbolEpoch = await redisClient.get(symbolEpochKey);
        if (symbolEpoch == null) {
            await redisClient.set(symbolEpochKey, trade.TS2);
            symbolEpoch = BigInt(trade.TS2);
        }
        else {
            symbolEpoch = BigInt(symbolEpoch);
        }
        symbolEpochMap.set(trade.sym, trade.TS2);
    }
    return symbolEpoch;
}

async function updateRedis(barNumber, trade) {
    const barKey = `${trade.sym}-${barNumber}`;
    const openKey = `${barKey}-O`;
    const rangeKey = `${barKey}-HL`;
    const closeKey = `${barKey}-C`;
    const volumeKey = `${barKey}-V`;
    return await redisClient.multi()
        .setnx(openKey, trade.P)
        .zadd(rangeKey, trade.P, trade.TS2)
        .zremrangebyrank(rangeKey, 1, -2)
        .set(closeKey, trade.P)
        .incrbyfloat(volumeKey, trade.P)
        // .expire(openKey, dataHoldingTime)
        // .expire(rangeKey, dataHoldingTime)
        // .expire(closeKey, dataHoldingTime)
        // .expire(volumeKey, dataHoldingTime)
        .xadd(streamPublishKey, 'MAXLEN', '~', streamLength, '*', 'UPDATE', barKey)
        .exec();
}

const processTradeFiles = async (filePath) => {

    const lineObject = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity
    });

    let totalTrades = 0;
    let tradesPerSecondCounter = 0;
    let timeBegin = Date.now();
    let promises = [];
    for await (const line of lineObject) {
        //Parse Trade
        if (line == null || line == '') continue;
        const trade = JSONBigIntNativeParser.parse(line);
        trade.TS2 = BigInt(trade.TS2);

        //Fetch Epoch
        const symbolEpoch = await getEpoch(trade);

        //Calculate Bar Number
        const barNumber = ((trade.TS2 - symbolEpoch) / barWidth) + barNumberStartPoint;

        //Update Bar Data
        promises.push(updateRedis(barNumber, trade)); // 2x Faster but requires ramping memory, approx 2.9k trades/sec
        //await updateRedis(barNumber, trade); // Slower but only requires 200MB, approx 700 trades/sec 

        // Perf Measurement -NON PROD
        totalTrades++;
        tradesPerSecondCounter++;
        const elapsed = Date.now() - timeBegin;
        if (elapsed > 1000) {
            console.log(`Trade Procesing Rate: ${((tradesPerSecondCounter / elapsed) * 1000).toFixed(2)}/${(elapsed / 1000).toFixed(2)} second`);
            timeBegin = Date.now();
            tradesPerSecondCounter = 0;
        }
    }
    await Promise.all(promises);
    return totalTrades;
}

console.time("Processing");
processTradeFiles(path.join(__dirname, '/../test/test.json'))
    .then((totalTrades) => {
        console.timeEnd("Processing");
        console.log("Total Trades: " + totalTrades);
        redisClient.quit();
    });