const fs = require("fs");
const redisType = require("ioredis");
const defaultRedisConnectionString = "redis://127.0.0.1:6379/";
const redisClient = new redisType(defaultRedisConnectionString);
const redisClientFetch = new redisType(defaultRedisConnectionString);
const barsReadSymbolMap = new Map();
const lastBarTimerMap = new Map();
const barTimeout = 20000;
const barNumberStart = 0n;
let trackCounter = 0;

redisClient.subscribe("ALLSYMB");
redisClient.on("message", async (channel, message) => {
    trackCounter++;
    const symbol = message.split("-")[0];
    const activeBarNumber = message.split("-")[1];
    const globPattern = `${symbol}-[^${activeBarNumber}]`;
    // const lastBarContext = lastBarTimerMap.get(symbol) || {};
    // if (lastBarContext.timerHandle !== null) {
    //     clearTimeout(lastBarContext.timerHandle);
    // }
    // lastBarContext.timerHandle = setTimeout(() => processBars(symbol, [message], activeBarNumber, "Timeout"), barTimeout);
    // lastBarTimerMap.set(symbol, lastBarContext);
    fs.appendFileSync(__dirname + "/../gc/" + symbol + ".txt", `${trackCounter}: ${message} \r\n`);
    let previousBarKeys = await redisClientFetch.scan(0, "MATCH", globPattern);
    if (previousBarKeys[1] < 1) return;
    previousBarKeys = previousBarKeys[1]
    fs.appendFileSync(__dirname + "/../gc/" + symbol + ".txt", `${trackCounter}: ${("Search: " + previousBarKeys.join(','))} \r\n`);
    //await processBars(symbol, previousBarKeys, activeBarNumber,"Channel");

});

async function processBars(symbol, barKeys, activeBarNumber, source) {

    //Get Data for previous keys
    let bars = [];
    let lastBarNumberProcessed = barsReadSymbolMap.get(symbol);
    let maximumBarNumberCurrentlyProcessed = lastBarNumberProcessed;
    for (let index = 0; index < barKeys.length; index++) {
        const key = barKeys[index];
        const barNumber = BigInt(key.split("-")[1])
        if (barNumber > activeBarNumber) continue;
        if (lastBarNumberProcessed == null || barNumber > lastBarNumberProcessed) {
            const bar = await redisClientFetch.hgetall(key);
            bars.push(bar);
            maximumBarNumberCurrentlyProcessed = maximumBarNumberCurrentlyProcessed < barNumber ? barNumber : maximumBarNumberCurrentlyProcessed;
        }
        else {
            console.log(`[SKIPPED] ${source}: ${symbol} got old bar#:${barNumber} expected to be greater than ${lastBarNumberProcessed}`);
        }
    }
    barsReadSymbolMap.set(symbol, maximumBarNumberCurrentlyProcessed);
    if (lastBarNumberProcessed == null) lastBarNumberProcessed = maximumBarNumberCurrentlyProcessed;

    //Gap Filler and Sorting
    for (let seqBarNumber = (lastBarNumberProcessed + 1n); seqBarNumber < (maximumBarNumberCurrentlyProcessed + 1n); seqBarNumber++) {
        const nullBar = { "F": 0, "H": 0, "L": 0, "C": 0, "V": 0, "event": "ohlc_notify", "symbol": symbol, "B": seqBarNumber };
        const data = bars.find((b) => BigInt(b.B) === seqBarNumber) || nullBar;
        const transformedBar = { "o": parseFloat(data.F), "h": parseFloat(data.H), "l": parseFloat(data.L), "c": parseFloat(data.C), "volume": parseFloat(data.V), "event": "ohlc_notify", "symbol": symbol, "bar_num": BigInt(data.B) };
        sinkData(transformedBar);
    }
}

function sinkData(bar) {
    //Sinking data to console but can be sinked into WS is required.
    console.log(bar);
}
